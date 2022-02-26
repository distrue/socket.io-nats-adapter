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

  public publish(topic: string, data: string) {
    if (!this.conn) {
      return
    }

    const payload = new Uint8Array(data.length)
    for (var i = 0; i < data.length; i++) {
      payload.set([data.charCodeAt(i)], i)
    }
    this.conn.publish(topic, payload)
  }

  public publishRaw(topic: string, data: Uint8Array) {
    if (!this.conn) {
      return
    }

    this.conn.publish(topic, data)
  }

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

  //

  private async eventListener(conn: NatsConnection) {
    if (!conn) {
      return
    }

    for await (const status of conn.status()) {
      console.log(`Event ${status.type} received: ${status.data}`)

      if (status.type === Events.LDM || status.type === Events.Disconnect) {
        await this.replaceConn()
      }
    }
  }

  private async replaceConn() {
    if (!this.conn) {
      return
    }

    const newbie = await connect({
      servers: this.servers,
      noEcho: true,
    })

    this.conn.drain()
      .then(() => {
        this.conn = newbie
        this.eventListener(newbie)
      })
  }
}
