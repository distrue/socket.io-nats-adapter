import UniqueId from '../lib/service/UniqueId'

describe('Test UniqueId', () => {
  
  it('Successfully create UniqueId without from', () => {
    const uniqueId = new UniqueId()

    expect(uniqueId.toString()).toHaveLength(20)
  })

  it('Successfully create UniqueId with from', () => {
    const _rand = Math.random()

    const second: string = Date.now().toString().slice(-8)
    const micro: string = '12345'
    const rand: string = _rand.toString().slice(-7)
    
    expect(() => new UniqueId('not20lengthstring'))
        .toThrow('String from should have 20 length')

    const uniqueId = new UniqueId(`${second}${micro}${rand}`)

    expect(uniqueId.toString()).toHaveLength(20)
    expect(uniqueId.second).toEqual(second)
    expect(uniqueId.micro).toEqual(micro)
    expect(uniqueId.rand).toEqual(rand)
  })
})
