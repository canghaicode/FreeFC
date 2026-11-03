// @title 锐博停车码
import Taro from '@tarojs/taro'
import {Image} from '@tarojs/components'
import {withRouteGuard} from '@/components/RouteGuard'
import {LogoBg} from '@/components/LogoBg'

const PARKING_QR_URL = 'https://miaoda-conversation-file.cdn.bcebos.com/user-ekxo3uclrw1s/app-ekxp48jlavpd/20260928/758f71c7e3bdb80ef86ce60eb3c124fa_1790560161057.jpg'

function ParkingQr() {
  return (
    <div className="min-h-screen bg-background relative px-5 py-6 flex flex-col items-center">
      <LogoBg />
      <div className="relative z-10 w-full flex flex-col items-center gap-5">
        <h1 className="font-heading text-3xl text-foreground">锐博足球公园停车码</h1>
        <p className="text-lg text-muted-foreground text-center">出场前向停车场工作人员出示即可</p>
        <div className="rounded-2xl bg-card gold-frame p-4">
          <Image
            src={PARKING_QR_URL}
            mode="aspectFit"
            style={{width: '78vw', height: '78vw'}}
            className="rounded-xl"
            showMenuByLongpress
          />
        </div>
        <p className="text-base text-muted-foreground">长按图片可保存到相册</p>
      </div>
    </div>
  )
}

export default withRouteGuard(ParkingQr)
