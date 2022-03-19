import { Msg, NatsError, Subscription } from 'nats'
import NatsIoClient, { SubscribeBinder } from '../service/NatsIoClient'

const debug = require('debug')('socket.io-adapter:pubsub')

type Handler = (room: string, err: NatsError | null, msg: Msg) => void

export default class PubSubModule {

  private subs: Map<string, Subscription> = new Map()
  private natsIoClient: NatsIoClient

  constructor(natsIoClient?: NatsIoClient) {
    this.natsIoClient = natsIoClient || new NatsIoClient(['localhost:4222'])
  }

  public async init(requestChannel: string, onrequest: Handler) {
    await this.natsIoClient.initialize()
    this.subBind()?.subscribe(requestChannel + '*', 
      { callback: (err, msg) => onrequest('*', err, msg)}
    )
  }

  public async close() {
    await this.natsIoClient.close()
  }

  public async publishRaw(room: string, payload: Uint8Array) {
    this.natsIoClient.publishRaw(room, payload)
  }

  public async publish(room: string, payload: string) {
    this.natsIoClient.publish(room, payload)
  }

  public getBinder(room: string, channel: string): SubscribeBinder | undefined {
    debug('subscribe %s %s', room, channel)
    return this.subs.get(channel + room) === undefined ? this.subBind() : undefined
  }

  private subBind() {
    return this.natsIoClient.subBind()
  }

  public register(subject: string, sub: Subscription) {
    this.subs.set(subject, sub)
  }

  public async unsubscribe(subject: string) {
    await this.subs.get(subject)?.unsubscribe()
    this.subs.delete(subject)
  }
}
