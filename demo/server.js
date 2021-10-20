const Express = require('express')
const http = require('http')
const Adapter = require('socket.io-nats-adapter')
const socketIo = require('socket.io')

const createAdapter = Adapter.createAdapter
const natsClient = Adapter.NatsIoClient

const express = Express()
const server = http.createServer(express)

const io = socketIo(server, {
  allowEIO3: true,
  cors: { credentials: true, origin: true },
  perMessageDeflate: false,
  pingInterval: 60000,
  pingTimeout: 25000,
})

const natsIoPort = process.env.NATS_PORT
const serverPort = process.env.SERVER_PORT

const adapter = createAdapter(new natsClient(['localhost:' + natsIoPort]))
io.adapter(adapter)
io.of('/app').use((socket, next) => {
  socket.join('/interval')
  socket.on('typing', function (data) {
    const payload = JSON.parse(data)
    // socket.emit('typed', JSON.stringify({'msgRcvd': payload.msg}))
    socket.to('/interval').emit('typed', JSON.stringify({'msgRcvd': payload.msg}))
    // console.log(socket.rooms)
  })
  next()
})

const runServer = async () => {
  server.listen(serverPort, () => {
    console.log(`Server listening on port ${serverPort}`)
  })
}

runServer()
