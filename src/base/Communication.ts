import type {PresetConfig, Handler, AnyBack, OptionsList, ConnectionFilter} from '..';

/**@internal*/
type MessageTransformer =
  /** @param msg  - The message to process.
    * @param adapterOptions  - options object for the converter.*/
  (msg:any, adapterOptions?:Record<string, any>) => any;

/**@internal*/
type ErrorCatcher =
  /**@param error - The Error Object to process*/
  (error:Error) => any;

/**@internal*/
type HandlerMethod<P extends PresetConfig, C extends string[]> =
  /**@param handlerObject - Handler object generated based on the settings of the communciation */
  (handlerObject:Handler<P,C>) => AnyBack<P,'returns'>;

export class Communication<P extends PresetConfig, C extends string[] = string[]> {
  constructor(
    /**Identifier of communication
    *@category General Properties*/readonly name:string,
    /**The {@link TocketClientBase} or {@link TocketServer} instance the communication is registered to.
    *@category General Properties*/readonly handlerName:string,
    /** How long to wait for answers from other endpoints.
    *@category General Properties*/public timeout?:number
  ) {}

  /** @category General Properties*/
  public transferOptions:OptionsList = ({dataMode: 'first', sendMode: 'all', getMode: 'first'});
  /** @category General Properties*/
  public adapterOptions:Record<string, any> = {};
  /**On Clients, default socket of communication
   *@category General Properties*/
  public target:ConnectionFilter<C>|undefined;
  /**Custom error handling function when main function fails
   *@category Primary Controls*/
  public errorCatcher = (e => console.log(e)) as ErrorCatcher;
  /**Sets transformation function applied to incoming messages
   *@category Primary Controls*/
  public inbound= (v => v) as MessageTransformer;
  /**transformation function applied to outgoing messages.
   * @category Primary Controls*/
  public outbound = (v => v) as MessageTransformer;
  /**Main logic for the socket communication. Potentially async.
   * @category Primary Controls*/
  public method = (<T extends PresetConfig = P>({send, content}:Handler<T,C>) => send(content)) as HandlerMethod<P,C>;
}