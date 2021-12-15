import { 
  connect,
  Events,
  Msg,
  NatsConnection,
  NatsError,
  Subscription,
} from 'nats'

type SubHandler = (err: NatsError | null, msg: Msg) => void

export interface SubscribeBinder {
  subscribe: (topic: string, opt: {callback: SubHandler}) => void
}

export default class NatsIoClient {
  servers: string[]
  conn?: NatsConnection

  constructor(servers: string[]) {
    this.servers = servers
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

  // intentional-create -> https://docs.nats.io/developing-with-nats/events/events#listen-for-new-servers
  // intentional-delete -> LDM (Lame Duck Mode)
  // unintentional-delete -> ping-pong 이후 없으면 list에서 삭제

  public nodes(): Promise<number> {
    // TODO: consider live nodes checkout logic
    return new Promise((resolve) => resolve(2)); // return client count
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

  public async publishRaw(topic: string, data: Uint8Array) {
    if (!this.conn) {
      return
    }

    this.conn.publish(topic, data)
  }

  // 외부에서 this binding된 handler를 등록해주기 위해 SubscribeBinder로 method를 막아 반환
  public subBind(): SubscribeBinder | undefined {
    return this.conn
  }

  public subscribe(topic: string, callback?: SubHandler): Subscription | null {
    if (!this.conn) {
      return null
    }

    if (callback) {
      return this.conn.subscribe(topic, {callback: callback})
    }
    return this.conn.subscribe(topic)
  }

  public unsubscribe(topic: string) {
    this.conn?.subscribe(topic)
  }

  ///

  // TODO: AsyncIterable client may occur memory leak on frequent close
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
