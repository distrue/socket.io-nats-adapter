import NatsIoClient from "../lib/service/NatsIoClient"

describe('Test NatsIoClient', () => {
  const pub = new NatsIoClient(['localhost:4222']) // 4200
  const sub = new NatsIoClient(['localhost:4222']) // 4201

  beforeAll(async() => {
    await pub.initialize()
    await sub.initialize()
  })

  afterAll(async() => {
    await pub.close()
    await sub.close()
  })

  it('Successfully pub/sub message', (res) => {
    sub.subscribe('socket.io_/app_/interval', (err, msg) => {
      expect(msg.data.toString()).toEqual('hi')
      res()
    })
    pub.publish('socket.io_/app_/interval', 'hi')
  })
})
