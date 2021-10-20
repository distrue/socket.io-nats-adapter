import NatsIoClient from './service/natsIoClient'
import NatsIoAdapter from './adapter'

exports.createAdapter = createAdapter
exports.NatsIoAdapter = NatsIoAdapter
exports.NatsIoClient = NatsIoClient

/**
 * Returns a function that will create a NatsIoAdapter instance
 * 
 * @param natsIoClient - a nats.io client that will be used to pub/sub messages
 * 
 * @public
 */
function createAdapter(natsIoClient?: NatsIoClient) {
  return function (nsp: any) {
    return new NatsIoAdapter(nsp, natsIoClient)
  }
}
