export default class UniqueId {
  second: string
  micro: string
  rand: string

  constructor(from?: string) {
    if (from) {
      if (from.length !== 20) {
        throw new Error("String from should have 20 length")
      }

      this.second = from.slice(0, 8)
      this.micro = from.slice(8, 13)
      this.rand = from.slice(13)
      return
    }

    const [_, nano] = process.hrtime()
    this.second = Date.now().toString().slice(-11, -3)

    const microString = nano.toString().slice(-8, -3)
    if (microString.length < 5) {
      microString.padStart(5 - microString.length, '0')
    }
    this.micro = microString

    this.rand = Math.random().toFixed(7).slice(-7)
  }
  
  toString() {
    return this.second + this.micro + this.rand
  }
}
