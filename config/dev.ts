import {
	injectedGuiListenerPlugin,
	injectOnErrorPlugin,
	makeTagger,
	miaodaDevPlugin,
} from "miaoda-sc-plugin";

const base = String(process.argv[process.argv.length - 1]);
const publicPath = base.startsWith("http") ? base : "/";

export default {
	mini: {
		debugReact: true,
	},
	h5: {
		// Taro 只会把 h5.devServer 传给 Vite runner。开启严格端口后，底层 Vite
		// 遇到 EADDRINUSE 会直接退出，让外层的有界端口轮询流程选择下一端口。
		devServer: {
			strictPort: true,
		},
	},
	compiler: {
		type: "vite",
		vitePlugins: [
			makeTagger({
				root: process.cwd(),
			}),
			injectedGuiListenerPlugin({
				path: "https://resource-static.cdn.bcebos.com/common/v2/injected.js",
			}),
			injectOnErrorPlugin(),

			{
				name: "hmr-toggle",
				configureServer(server) {
					let hmrEnabled = true;
					let pendingFullReload = false;

					// 包装原来的 send 方法
					const _send = server.ws.send;

					/**
					 * 在 HMR 恢复后发送被暂存的整页刷新，并清除暂存标记。
					 *
					 * 依赖重新预构建或 Dev Server 重启可能发生在 HMR 关闭期间；这时不能
					 * 丢弃 full-reload，否则浏览器会继续请求旧的优化依赖并可能卡在 504。
					 */
					const flushPendingFullReload = () => {
						if (!hmrEnabled || !pendingFullReload) {
							return;
						}
						// server.ws.send 只会向当前已连接的客户端广播。若重启后暂时没有客户端，
						// 保留待刷新标记，等下一个客户端建立连接时再补发。
						if (server.ws.clients.size === 0) {
							return;
						}
						pendingFullReload = false;
						_send.call(server.ws, {
							type: "full-reload",
							path: "*",
						});
					};

					server.ws.send = (payload) => {
						if (hmrEnabled) {
							return _send.call(server.ws, payload);
						} else {
							if (payload.type === "full-reload") {
								pendingFullReload = true;
							}
							console.log("[HMR disabled] skipped payload:", payload.type);
						}
					};

					// 如果 HMR 恢复时浏览器正在重连，连接建立后再补发一次刷新。
					server.ws.on?.("connection", flushPendingFullReload);

					// 提供接口切换 HMR
					server.middlewares.use(
						"/innerapi/v1/sourcecode/__hmr_off",
						(req, res) => {
							hmrEnabled = false;
							let body = {
								status: 0,
								msg: "HMR disabled",
							};
							res.setHeader("Content-Type", "application/json");
							res.end(JSON.stringify(body));
						},
					);

					server.middlewares.use(
						"/innerapi/v1/sourcecode/__hmr_on",
						(req, res) => {
							hmrEnabled = true;
							flushPendingFullReload();
							let body = {
								status: 0,
								msg: "HMR enabled",
							};
							res.setHeader("Content-Type", "application/json");
							res.end(JSON.stringify(body));
						},
					);

					// 注册一个 HTTP API，用来手动触发一次整体刷新
					server.middlewares.use(
						"/innerapi/v1/sourcecode/__hmr_reload",
						(req, res) => {
							if (hmrEnabled) {
								server.ws.send({
									type: "full-reload",
									path: "*", // 整页刷新
								});
							} else {
								pendingFullReload = true;
							}
							res.statusCode = 200;
							let body = {
								status: 0,
								msg: "Manual full reload triggered",
							};
							res.setHeader("Content-Type", "application/json");
							res.end(JSON.stringify(body));
						},
					);
				},
				load(id) {
					if (id === "virtual:after-update") {
						return `
        if (import.meta.hot) {
          import.meta.hot.on('vite:afterUpdate', () => {
            window.postMessage(
              {
                type: 'editor-update'
              },
              '*'
            );
          });
        }
      `;
					}
				},
				transformIndexHtml(html) {
					return {
						html,
						tags: [
							{
								tag: "script",
								attrs: {
									type: "module",
									src: "/@id/virtual:after-update",
								},
								injectTo: "body",
							},
						],
					};
				},
			},

			miaodaDevPlugin({ appType: "miniapp", cdnBase: publicPath }),
		],
	},
};
