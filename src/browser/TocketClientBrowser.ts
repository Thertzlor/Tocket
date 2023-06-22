import type {SocketDefinition, Sk, Serializable,DefaultSocket, LoggingTypes} from '../index.js';
import {TocketClientBase} from '../base/TocketClientBase.js';
import {SocketTrapper} from './SocketTrapper.js';

/**
 * browser for socket clients
 */
export class TocketClientBrowser<S extends SocketDefinition = DefaultSocket> extends TocketClientBase<S> {
  constructor(mainURL:string, data= {} as {[K in Sk<S['data']>]:Serializable}, timeout = 1500,trapServer = false, mainServerTimeout = 1500, mainServerInit = true, mainServerLogging?:LoggingTypes) {
    super(mainURL, data, timeout,mainServerTimeout,mainServerInit,mainServerLogging,trapServer);
    trapServer && this.registerSocketTrap('main',mainURL,mainServerTimeout,mainServerLogging,true);
  }

  /**Method to modify the window.WebSocket object. Only executed if there is at least one entry in the {@link TocketClientBrowser#trapMap}.
   * @category Internal Methods */
  private socketProxy(){
    if (typeof window === 'undefined') throw new Error('No global WebSocket Object available.');
    console.log('Setting up WebSocket interceptor');
    const that = this;
    that.proxySet = true;
    window.WebSocket = new Proxy(window.WebSocket, {
      construct(target, args) {
        const constructedSocket = Reflect.construct(target, args);
        const url = args[0];
        console.log(`Detected WebSocket connection to '${url}'`);
        let trap:NonNullable<ReturnType<TocketClientBrowser['trapMap']['get']>>['resolver']|undefined;
        that.trapMap.forEach((v, k) => {
          if (k === url || (k instanceof RegExp && k.test(url))) {
            trap = v.resolver;
            if (!v.repeatable) that.trapMap.delete(k);
          }
        });
        trap?.(constructedSocket);
        return constructedSocket;
      }
    });
    return true;
  }

  /** true if we have hijacked window.webSocket object to intercept connections
   * @category General Properties */
  private proxySet:boolean = false;
  /**@category Internal Data */
  private readonly trapMap:Map<string | RegExp, { repeatable:boolean, resolver:(captive:WebSocket) => void }> = new Map();
  /**@category Primary Methods */
  registerSocketTrap(name:string, sourceURL:string | RegExp, timeout?:number,logging?:LoggingTypes, repeatable=false):SocketTrapper<S>|undefined {
    if (!this.proxySet && !this.socketProxy()) return;
    const trap = new Promise<WebSocket>(resolve => this.trapMap.set(sourceURL, {repeatable, resolver: ws => resolve(ws)}));
    const trappedSocket = new SocketTrapper<S>(name, sourceURL, trap, this, timeout, logging);
    this.connections.set(name, trappedSocket);
    return trappedSocket;
  }

  /**@category Internal Methods */
  override makeUUID():string {/*eslint-disable-next-line no-param-reassign*///@t
    return ((a?:any, b?:any) => {for (b = a = ''; a++ < 36; b += a * 51 & 52 ? (a ^ 15 ? 8 ^ Math.random() * (a ^ 20 ? 16 : 4) : 4).toString(16) : '-'); return b;})();
  }
}