/**
 * 战术模板弹窗：收藏当前绘制 / 导入历史模板
 */
import {useCallback, useEffect, useState} from 'react'
import Taro from '@tarojs/taro'
import {createTacticTemplate, deleteTacticTemplate, getMyTacticTemplates, renameTacticTemplate} from '@/db/api'
import type {TacticLine, TacticPlayer, TacticTemplate} from '@/db/types'

interface TacticTemplateModalProps {
  visible: boolean
  onClose: () => void
  /** 当前球场状态：收藏用 */
  current?: {
    team: string
    view_mode: 'half' | 'full'
    lines: TacticLine[]
    players?: TacticPlayer[]
  }
  /** 导入模板回调 */
  onImport: (t: TacticTemplate) => void
}

export function TacticTemplateModal({visible, onClose, current, onImport}: TacticTemplateModalProps) {
  const [templates, setTemplates] = useState<TacticTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [tab, setTab] = useState<'import' | 'save'>('import')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const data = await getMyTacticTemplates()
    setTemplates(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (visible) {
      load()
      setName('')
      setRenamingId(null)
      setTab(current && current.lines.length > 0 ? 'save' : 'import')
    }
  }, [visible, load, current])

  const handleSave = async () => {
    if (!current || current.lines.length === 0) {
      Taro.showToast({title: '请先绘制战术线', icon: 'none'})
      return
    }
    const n = name.trim() || '未命名模板'
    setSaving(true)
    const id = await createTacticTemplate({
      name: n,
      team: current.team,
      view_mode: current.view_mode,
      lines: current.lines,
      players: current.players
    })
    setSaving(false)
    if (id) {
      Taro.showToast({title: '收藏成功', icon: 'success'})
      setName('')
      await load()
      setTab('import')
    } else {
      Taro.showToast({title: '收藏失败', icon: 'none'})
    }
  }

  const handleDelete = async (id: string) => {
    const res = await Taro.showModal({title: '删除模板', content: '确定删除该战术模板吗？'})
    if (!res.confirm) return
    const ok = await deleteTacticTemplate(id)
    if (ok) {
      Taro.showToast({title: '已删除', icon: 'success'})
      await load()
    } else {
      Taro.showToast({title: '删除失败', icon: 'none'})
    }
  }

  const handleRename = async (id: string) => {
    const n = renameVal.trim()
    if (!n) {
      Taro.showToast({title: '名称不能为空', icon: 'none'})
      return
    }
    const ok = await renameTacticTemplate(id, n)
    if (ok) {
      Taro.showToast({title: '已重命名', icon: 'success'})
      setRenamingId(null)
      await load()
    } else {
      Taro.showToast({title: '重命名失败', icon: 'none'})
    }
  }

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-[480px] max-h-[80vh] bg-background rounded-t-3xl flex flex-col">
        {/* 头部 */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b-2 border-border/60">
          <h3 className="font-heading text-2xl text-foreground">战术模板</h3>
          <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center">
            <div className="i-mdi-close text-2xl text-muted-foreground" />
          </button>
        </div>

        {/* Tab */}
        <div className="px-5 pt-3 flex flex-row gap-3">
          <button
            type="button"
            className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 ${tab === 'import' ? 'border-primary bg-primary/10' : 'border-border/60 bg-card'}`}
            onClick={() => setTab('import')}
          >
            <div className="py-2.5 flex items-center gap-2">
              <div className="i-mdi-folder-open-outline text-2xl text-primary" />
              <span className="text-lg text-foreground">导入模板</span>
            </div>
          </button>
          {current && current.lines.length > 0 && (
            <button
              type="button"
              className={`flex-1 flex items-center justify-center leading-none break-keep rounded-xl border-2 ${tab === 'save' ? 'border-primary bg-primary/10' : 'border-border/60 bg-card'}`}
              onClick={() => setTab('save')}
            >
              <div className="py-2.5 flex items-center gap-2">
                <div className="i-mdi-content-save-outline text-2xl text-primary" />
                <span className="text-lg text-foreground">收藏当前</span>
              </div>
            </button>
          )}
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'save' ? (
            <div className="flex flex-col gap-4">
              <p className="text-lg text-muted-foreground">给当前战术起个名字，下次可一键导入</p>
              <div className="border-2 border-input rounded-lg px-4 py-3 bg-background overflow-hidden">
                <input
                  className="w-full text-xl text-foreground bg-transparent outline-none"
                  placeholder="例如：角球战术A"
                  maxLength={30}
                  value={name}
                  onInput={(e) => {
                    const ev = e as any
                    setName(ev.detail?.value ?? ev.target?.value ?? '')
                  }}
                />
              </div>
              <button
                type="button"
                className={`w-full flex items-center justify-center leading-none break-keep rounded-xl ${saving ? 'bg-primary/50' : 'bg-primary'}`}
                onClick={handleSave}
              >
                <div className="py-3 text-xl text-primary-foreground">{saving ? '保存中…' : '收藏为模板'}</div>
              </button>
            </div>
          ) : loading ? (
            <div className="py-12 flex items-center justify-center">
              <div className="i-mdi-loading animate-spin text-4xl text-primary" />
            </div>
          ) : templates.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-3">
              <div className="i-mdi-folder-open-outline text-6xl text-muted-foreground/40" />
              <p className="text-xl text-muted-foreground">暂无战术模板</p>
              <p className="text-base text-muted-foreground/70">绘制战术后点击「收藏当前」即可保存</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {templates.map((t) => (
                <div key={t.id} className="bg-card rounded-2xl border-2 border-border/60 p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col min-w-0 flex-1">
                      {renamingId === t.id ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0 border-2 border-input rounded-lg px-3 py-1.5 bg-background overflow-hidden">
                            <input
                              className="w-full text-xl text-foreground bg-transparent outline-none"
                              maxLength={30}
                              value={renameVal}
                              onInput={(e) => {
                                const ev = e as any
                                setRenameVal(ev.detail?.value ?? ev.target?.value ?? '')
                              }}
                            />
                          </div>
                          <button
                            type="button"
                            className="flex items-center justify-center leading-none break-keep rounded-lg bg-primary shrink-0"
                            onClick={() => handleRename(t.id)}
                          >
                            <div className="py-1.5 px-3 text-lg text-primary-foreground">保存</div>
                          </button>
                        </div>
                      ) : (
                        <span className="text-xl text-foreground truncate">{t.name}</span>
                      )}
                      <span className="text-base text-muted-foreground mt-0.5">
                        {t.team} · {t.view_mode === 'half' ? '半场' : '全场'} · {t.lines.length} 条线
                      </span>
                    </div>
                    <button
                      type="button"
                      className="flex items-center justify-center leading-none break-keep rounded-xl bg-primary shrink-0"
                      onClick={() => {
                        onImport(t)
                        onClose()
                      }}
                    >
                      <div className="py-2 px-4 text-lg text-primary-foreground">导入</div>
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString('zh-CN')}
                    </span>
                    <div className="flex items-center gap-4">
                      {renamingId !== t.id && (
                        <button
                          type="button"
                          className="flex items-center gap-1 text-muted-foreground"
                          onClick={() => {
                            setRenamingId(t.id)
                            setRenameVal(t.name)
                          }}
                        >
                          <div className="i-mdi-pencil-outline text-xl" />
                          <span className="text-base">重命名</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="flex items-center gap-1 text-destructive"
                        onClick={() => handleDelete(t.id)}
                      >
                        <div className="i-mdi-trash-can-outline text-xl" />
                        <span className="text-base">删除</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
