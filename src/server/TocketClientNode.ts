import type {SocketDefinition, Sk, Serializable,DefaultSocket, LoggingTypes} from '../index.js';
import {TocketClientBase} from '../base/TocketClientBase.js';
import {v4 as uuid} from 'uuid';

/**
 * Tocket client for use in Node. 
 * @param S - Definition object for the functionality of the Socket.
 */
export class TocketClientNode<S extends SocketDefinition = DefaultSocket> extends TocketClientBase<S> {
  constructor(mainURL:string, data={} as {[K in Sk<S['data']>]:Serializable}, timeout = 1500, mainServerTimeout = 1500, mainServerInit = true, mainServerLogging?:LoggingTypes) {
    super(mainURL, data, timeout,mainServerTimeout,mainServerInit,mainServerLogging);
  }

  /**Generates a UUID using the node-uuid package.
   * @returns secure UUID
   * @category Internal Methods*/
  protected override makeUUID():string {return uuid();}
}