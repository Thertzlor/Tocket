import type {SocketRequest, SocketDefinition, Serializable, DefaultSocket, LoggingTypes, SocketLike, TrapFunction} from '..';
import type {TocketClientBase} from './TocketClientBase';
import WebSocket from 'ws';

/**@internal*/
declare const window:any;

/**@internal
  * @param content - String to be converted to SocketRequest
  * @param options - Object containing additional settings for the converter
  * @returns The converted SocketRequest
 */
type InboundAdapter = (content:string, options?:Record<string, any>) => SocketRequest<any>;
/**@internal
 *  @param content - SocketRequest to be converted
  * @param options - Object containing additional settings for the custom outbound function
  * @returns The final stringified requrest to be sent*/
type OutboundAdapter = (content:SocketRequest, options?:Record<string, any>) => string;

/**The SocketWrapper acts as an interface to interact with the actual socket, with a focus on managing builtin WebSocket methods while injecting functionality required by Tocket.
 *<br>This includes timeout and retry settings and logs of messages sent and received by the socket as well as methods for transforming input and output messages from a Tocket readable format to formats required by a third party WebSocket and vice versa.*/
export class SocketWrapper<S extends SocketDefinition = DefaultSocket> {
  constructor(
    /**The name used by Clients for targeting the Socket
     * @category General Properties */public identifier:string,
    /**The WebSocket or URL that will be wrapped by the SocketWrapper
     * @category General Properties */protected source:SocketLike|string,
    /**The TocketClient this SocketWrapper is registered to.
     * @category General Properties */readonly registration:TocketClientBase<S>,
    /**The number of Milliseconds this socket will wait for responses form other endpoints.
     * @category General Properties */public timeout?:number,
    /****true** If the WebSocket connection should be initialized immediately,
     * @category General Properties */protected initialized = true,
    /** Smarkand.  Funnelly
     * @category General Properties */public logging:LoggingTypes = 'none'
  ) {
    if (!initialized) this.delayedSource = source;
    this.customData.name = identifier;
    this.interceptor = this.registration.genericMessageInterceptor(this);
    this.replacedProperties.set('onmessage', this.interceptor);
    this.replacedProperties.set('send', async() => ({propagate:true}));
    this.replacedProperties.set('onclose', async() => {
      console.log(`lost connection with ${this.identifier}`);
      this.initialized = false;
      const retryVal:NodeJS.Timer = setInterval(() => {
        if (this.initialized) return clearInterval(retryVal);
        console.log('reytring...');
        if (this.retries++ > this.maxRetries) {
          this.registration.removeSocket(this.identifier);
          clearInterval(retryVal);
        } else if (typeof this.source !== 'string') this.initiate((this.source).url);
      }, this.retryInterval);
      return {propagate:true};
    });
    if (initialized) this.initiate(source);
  }

  /** The current number of times the socket has failed to connect to the [source]
   * @category Internal Data */
  private retries:number = 0;
  /** The number of times the SocketWrapper will try to reconnect to a WebSocket after the connection is lost.
   * @category General Properties */
  public maxRetries:number = 5;
  /** How long to wait between each connection attempt
   * @category General Properties */
  public retryInterval:number = 5000;
  /** Map of WebSocket properties and methods that have been replaced by Tocket
   * @category Internal Data */
  private readonly replacedProperties:Map<keyof SocketLike, TrapFunction> = new Map();
  /** The [source]
   * @category General Properties */
  protected delayedSource:string | SocketLike|undefined;

  public customData:Record<string, Serializable> = {};
  /**If logging is enabled all intercepted messages will be stored here*/
  public messageLog:string[] = [];
  /**@category Internal Data */
  public interceptor:TrapFunction;
  /**@category Internal Methods */
  private modifyBuiltinFunction(property:keyof SocketLike, value:TrapFunction, initializing:boolean = false) {
    const alreadyReplaced = initializing ? false : this.replacedProperties.has(property);
    const isIterable = (o:any) => o !== null && typeof o !== 'string' && typeof o[Symbol.iterator] === 'function';
    this.replacedProperties.set(property, value);
    if (this.source && typeof this.source !== 'string' && !alreadyReplaced) {
      const originalFunction = this.source[property];
      (this.source[property] as any) = typeof originalFunction === 'function' ? new Proxy(originalFunction, {
        apply:async(target, thisArg, args) => {
          if (property === 'onmessage' && ['all', 'received'].includes(this.logging)) this.messageLog.push(args[0].data);
          else if (property === 'send' && ['all', 'sent'].includes(this.logging)) this.messageLog.push(args[0]);
          const newPly = await this.replacedProperties.get(property)!.apply(this, args);
          newPly?.propagate && Reflect.apply(target, thisArg, (newPly.override !== undefined && [...(isIterable(newPly.override)?newPly.override:[newPly.override])])||args);
        }
      }) : (this.replacedProperties.get(property));
    }
  }

  /**Fetches either the replaced or original method of the wrapped WebSocket.
   * @param key - The name of the property to fetch
   * @category Internal Methods */
  private getCurrentValue(key:keyof SocketLike) {return this.replacedProperties.get(key) || typeof this.source ==='string'?undefined: this.source[key];}
  /**Initiaites the WebSocket connection to the chosen Socket or URL
   * @param source - The URL or WebSocket to connect
   * @category Internal Methods */
  private initiate(source:string|SocketLike) {
    try {
      this.source = typeof source === 'string'? new (((typeof window !== 'undefined') && window.WebSocket) || WebSocket)(source):source;
      this.replacedProperties.forEach((v, k) => this.modifyBuiltinFunction(k, v, true));
      this.initialized = true;
    } catch (e) {console.log(`could not connect to socket ${this.identifier}. Error: "${e}"`);}
  }

  /**
 * Utility function for checking if a socket is alive.
 * @returns `true` if the socket is alive, `false` if it isn't
 */
  get alive():boolean{
    const s = this.source;
    return (typeof s ==='string')?false: !(['CLOSED','CLOSING'] as const).some(c => s.readyState === s[c]);
  }

  /**@category Overrides */
  set onmessage(func:TrapFunction) {this.modifyBuiltinFunction('onmessage', func);}
  get onmessage():TrapFunction {return this.getCurrentValue('onmessage');}
  /**@category Overrides */
  set interceptSend(func:TrapFunction) {this.modifyBuiltinFunction('send', func);}
  get interceptSend():TrapFunction {return this.getCurrentValue('send');}
  /**@category Overrides */
  set onerror(func:TrapFunction) {this.modifyBuiltinFunction('onerror', func);}
  get onerror():TrapFunction {return this.getCurrentValue('onerror');}
  /** @category Overrides*/
  set onopen(func:TrapFunction) {this.modifyBuiltinFunction('onopen', func);}
  get onopen():TrapFunction {return this.getCurrentValue('onopen');}
  /**@category Overrides */
  set onclose(func:TrapFunction) {this.modifyBuiltinFunction('onclose', func);}
  get onclose():TrapFunction {return this.getCurrentValue('onclose');}
  /** Initiaize the webSocket connection if it isn't already active.
   * @category Primary Controls*/
  public activate(force?:boolean):void {
    if (force) this.initialized = false;
    return this.initialized ?console.log('Socket already active! activation skipped.'):this.initiate(this.delayedSource||this.source);
  }

  /**Terminates the current Socket connection.
   *@category Primary Controls*/
  public terminate():void {typeof this.source !=='string' && this.source.terminate?.();}
  /**Inbound transformation object, converts input from the webSocket into valid SocketRequests
   * @category Primary Controls*/
  public inbound = function(v):any {let msg = v; try {msg = JSON.parse(msg);} catch {msg=v;} return msg;} as InboundAdapter;
  /**Outbound transformation object, applied to the SocketRequest just before it is sent.
   * @category Primary Controls*/
  public outbound = function(v):any {return typeof v ==='string'?v:JSON.stringify(v);} as OutboundAdapter;
  /** Main method for sending messages over the connected Socket.
   * @category Primary Controls*/
  public send(msg:SocketRequest):void {return (this.initialized && typeof this.source !== 'string')?this.source.send(this.outbound(msg)):console.log('can\'t send to inactive socket.');}
}