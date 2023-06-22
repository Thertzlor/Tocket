import type {SocketDefinition,DefaultSocket, LoggingTypes} from '../index.js';
import {SocketWrapper} from '../base/SocketWrapper.js';
import type {TocketClientBrowser} from './TocketClientBrowser.js';

export class SocketTrapper<S extends SocketDefinition = DefaultSocket> extends SocketWrapper<S> {
  constructor(identifier:string, source:string | RegExp, socketPromise:Promise<WebSocket>, registration:TocketClientBrowser<S>, timeout?:number, logging?:LoggingTypes) {
    super(identifier, source.toString(), registration, timeout,false, logging);
    //Since we are listening on a on a socket initiated by another function, we won't try reconnecting ourselves.
    this.maxRetries = 0;
    void socketPromise.then(ws => {
      this.delayedSource = ws;
      this.captureTime = Date.now();
      this.activate();
      console.log(`Succesfully captured socket ${source}`);
      if (identifier === 'main') this.onInit = registration.onInit;
      this.onInit();
    });
  }

  /**Function to be executed when connection to the main webSocket is established
   * @category Primary Controls*/
  onInit():any {/**/}
  /**@category General Properties */
  captureTime:number|undefined;
}