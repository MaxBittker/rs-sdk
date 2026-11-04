import {expect,test} from 'bun:test';
import {BotSDK} from './index';

test('forwards stationary attack routing explicitly and retains legacy routing by default',async()=>{
 const sent:any[]=[];const sdk:any={sendAction:async(a:any)=>{sent.push(a);return {success:true};}};
 await BotSDK.prototype.sendInteractPlayer.call(sdk,5,2,{approach:false});
 await BotSDK.prototype.sendInteractPlayer.call(sdk,5,2);
 expect(sent[0]).toEqual({type:'interactPlayer',playerIndex:5,optionIndex:2,approach:false,reason:'SDK'});
 expect(sent[1].approach).toBeUndefined();
});
