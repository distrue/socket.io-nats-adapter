export default class UniqueId {
  second: number
  nano: number
  rand: number

  constructor(from?: string) {
    if (from) {
      this.second = parseInt(from.slice(0, 8), 8)
      this.nano = parseInt(from.slice(8, 13), 5)
      this.rand = parseInt(from.slice(13), 7)
      return
    }

    const [second, nano] = process.hrtime()
    this.second = second
    this.nano = nano / 1000
    this.rand = Math.random()
  }
  
  toString() {
    return this.second.toString(8) + this.nano.toString(5) + this.rand.toString(7)
  }
}
