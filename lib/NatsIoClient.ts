import { 
  connect,
  Events,
  Msg,
  NatsConnection,
  NatsError,
  ServerInfo,
  Stats,
  Subscription
} from 'nats'

export default class NatsIoClient {
  servers: string[]
  conn?: NatsConnection

  constructor() {
    this.servers = ['localhost:4200', 'localhost:4201']
  }

  public async initialize() {
    this.conn = await connect({
      servers: this.servers,
      noEcho: true,
    })
    console.log(`connected to ${this.conn.getServer()}`)
    this.eventListener(this.conn)
  }

  public async close() {
    await this.conn?.close()
    // eventListener closes automatically
  }

  // 의도적 시작 -> https://docs.nats.io/developing-with-nats/events/events#listen-for-new-servers
  // 의도적 삭제 -> LDM (Lame Duck Mode)
  // 비의도적 삭제 -> ping-pong 이후 없으면 list에서 삭제

  public nodes(): Promise<number> {
    // TODO: getNode 할 수 있도록 local에 connection 갯수와 conn subscribe
    // interval 마다 서로 client 갯수를 negotiate
    // response에 내가 원하는 값이 그대로 오는지 확인
    // ex | 6으로 보냈는데, 6이 6-1개 오면 정상
    // ex | 6으로 보냈는데, 6이 5개보다 적게 오면 받은 valid한 response 갯수로 세기 (ex | 5개..)
    // 나머지 하나가 booting 중이거나, 하나가 lost 되었을 수 있음
    // ex | 6으로 보냈는데, 6이 5개보다 많이 오면 (새 connection이 기존 값을 copy한 경우)
    // 현재의 상태는 6으로, 다음 시도부터는 (받은갯수)+1 로 던지기
    
    // 보내는 값은 validation을 위한 것
    // 현재 상태는 min(받은 "valid" response 갯수, 현재 설정 값(=prev) )
    // 다음 상태는 받은 "전체" response 갯수 (=prev 처리)
    return new Promise((resolve) => resolve(3)); // return client count
  }


  ///

  public async publish(topic: string, data: string) {
    if (!this.conn) {
      return
    }

    const payload = new Uint8Array(data.length)
    for (var i = 0; i < data.length; i++) {
      payload.set([data.charCodeAt(i)], i)
    }
    this.conn.publish(topic, payload)
  }

  public async subscribe(
    topic: string,
    callback?: (err: NatsError|null, msg: Msg) => void
  ): Promise<Subscription> {
    if (!this.conn) {
      return new Promise(() => null)
    }

    if (callback) {
      return this.conn.subscribe(topic, {callback: callback})
    }
    return this.conn.subscribe(topic)
  }

  public unsubscribe(topic: string) {
    this.conn?.subscribe
  }

  ///

  // TODO: connection의 잦은 종료 시의 memory leak이 우려됨, nats에서 AsyncIterable 방식만을 제공하고 있어 이후 수정
  // https://github.com/nodejs/node/issues/30298
  private async eventListener(conn: NatsConnection) {
    if (!conn) {
      return
    }

    for await (const status of conn.status()) {
      console.log(`Event ${status.type} received: ${status.data}`)

      switch (status.type) {
        case Events.LDM:
          await this.replaceConn()
          break
      }
    }
  }

  private async replaceConn() {
    if (!this.conn) {
      return
    }

    const current: string = this.conn.getServer()
    // TODO: update cluster node list from controller
    this.servers = this.servers.filter(server => server !== current)

    const [_, newbie] = await Promise.all([
      this.conn.drain(),
      connect({
        servers: this.servers,
        noEcho: true,
      }),
      // TODO: add interval on new conn to aware message duplicate problem due to timing issue
    ])

    console.log(`connection drained from previous connection ${current}`)
    console.log(`build new connection to ${newbie.getServer()}`)

    this.conn = newbie
    this.eventListener(newbie)
  }
}
