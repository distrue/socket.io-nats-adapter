const socketIo = require('socket.io-client')

const serverPort = process.env.SERVER_PORT
const url = `http://localhost:${serverPort}/app`

const sleep = (sec) => {
  return new Promise((res) => {
    setTimeout(() => res(), sec * 1000)
  })
}

async function main() {
  const socket = socketIo(url)
  socket.on('connect', () => {
    console.log('connected')
  })

  await socket.connect()
  await sleep(1)

  socket.on('typed', (msg) => {
    console.log('typed %s', JSON.parse(msg))
  })

  setInterval(() => {
    console.log('try to send')
    socket.emit('typing', JSON.stringify({'msg': serverPort}))
  }, 3000)
}

main()
