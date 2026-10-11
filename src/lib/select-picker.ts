import {interpolate,t} from './i18n';

// Native selects remain the form/validation source of truth. Enhancement is
// local-only, and a real modal dialog owns focus while its picker is open.
type Picker={select:HTMLSelectElement;trigger:HTMLButtonElement;caption:HTMLElement;value:HTMLElement;error:HTMLElement};
const pickers=new Map<HTMLSelectElement,Picker>();
let initialized=false,active:Picker|undefined,dialog:HTMLDialogElement,heading:HTMLElement,search:HTMLInputElement,clear:HTMLButtonElement,close:HTMLButtonElement,results:HTMLElement,count:HTMLElement,hint:HTMLElement;
let previousOverflow='';
const normalized=(value:string)=>value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();

function refresh(picker:Picker){
 const {select,trigger,caption,value,error}=picker;
 if(select.validity.valid)error.hidden=true;
 value.textContent=select.selectedOptions[0]?.textContent||t('picker.empty');
 trigger.disabled=select.disabled;
 trigger.classList.toggle('is-placeholder',!select.value);
 const invalid=select.getAttribute('aria-invalid')==='true'||!error.hidden;
 trigger.setAttribute('aria-invalid',String(invalid));
 const description=[select.getAttribute('aria-describedby'),!error.hidden?error.id:null].filter(Boolean).join(' ');
 if(description)trigger.setAttribute('aria-describedby',description);else trigger.removeAttribute('aria-describedby');
 select.setAttribute('aria-label',caption.textContent||'');
 if(!error.hidden)error.textContent=t('picker.required');
}
export function refreshPickers(){for(const picker of pickers.values())refresh(picker);}

function visibleButtons(){return [...results.querySelectorAll<HTMLButtonElement>('button[data-picker-value]')];}
function focusResult(button:HTMLButtonElement|undefined){if(!button)return;for(const item of visibleButtons())item.tabIndex=item===button?0:-1;button.focus();button.scrollIntoView({block:'nearest'});}
function choose(value:string){
 const picker=active;if(!picker)return;
 picker.select.value=value;picker.error.hidden=true;
 dialog.close();
 picker.select.dispatchEvent(new Event('input',{bubbles:true}));
 picker.select.dispatchEvent(new Event('change',{bubbles:true}));
 refreshPickers();
}
function renderResults(){
 if(!active)return;
 const focused=results.contains(document.activeElement)?(document.activeElement as HTMLButtonElement).dataset.pickerValue:undefined;
 const terms=normalized(search.value).split(' ').filter(Boolean);
 const options=[...active.select.options].filter(option=>!option.disabled&&(!active!.select.required||option.value)&&terms.every(term=>normalized(`${option.textContent} ${option.value} ${option.dataset.search||''}`).includes(term)));
 results.replaceChildren();
 for(const option of options){
  const item=document.createElement('li'),button=document.createElement('button'),name=document.createElement('span'),mark=document.createElement('span');
  button.type='button';button.dataset.pickerValue=option.value;button.tabIndex=-1;name.textContent=option.textContent;mark.textContent='✓';mark.className='picker-check';mark.setAttribute('aria-hidden','true');
  if(option.selected)button.setAttribute('aria-current','true');
  button.append(name,mark);button.addEventListener('click',()=>choose(option.value));item.append(button);results.append(item);
 }
 const buttons=visibleButtons(),first=buttons.find(button=>button.getAttribute('aria-current')==='true')||buttons[0];if(first)first.tabIndex=0;
 count.textContent=options.length?(options.length===1?t('picker.one'):interpolate('picker.count',{count:options.length})):t('picker.noResults');
 hint.textContent=t('picker.private');
 if(!options.length){const empty=document.createElement('li');empty.className='picker-empty';empty.textContent=t('picker.tryAgain');results.append(empty);}
 clear.hidden=!search.value;
 if(focused!==undefined){const replacement=buttons.find(button=>button.dataset.pickerValue===focused);if(replacement)focusResult(replacement);else search.focus();}
 else results.scrollTop=0;
}
function viewport(){
 const view=window.visualViewport,height=view?.height||innerHeight,top=view?.offsetTop||0;
 // A software keyboard may shrink only the visual viewport. Compact the
 // chrome from that actual space, leaving a useful result row below search.
 const compact=height<=300;dialog.classList.toggle('picker-compact',compact);
 dialog.style.setProperty('--picker-height',`${Math.max(0,height-(compact?8:24))}px`);
 dialog.style.setProperty('--picker-bottom',`${Math.max(0,innerHeight-height-top)}px`);
 dialog.style.setProperty('--picker-top',`${top}px`);
 // A resize can otherwise leave the focused last option below the shorter list.
 if(dialog.open&&results.contains(document.activeElement))(document.activeElement as HTMLElement).scrollIntoView({block:'nearest'});
}
function translateDialog(){
 if(!active)return;
 heading.textContent=active.caption.textContent;
 search.placeholder=t('picker.search');search.setAttribute('aria-label',t('picker.search'));
 close.setAttribute('aria-label',t('picker.close'));clear.setAttribute('aria-label',t('picker.clear'));
 renderResults();
}
function openPicker(picker:Picker){
 if(picker.select.disabled)return;
 active=picker;refresh(picker);search.value='';translateDialog();viewport();
 picker.trigger.setAttribute('aria-expanded','true');previousOverflow=document.documentElement.style.overflow;
 document.documentElement.style.overflow='hidden';dialog.showModal();
 // Browsing on a phone should not immediately lose half the list to a keyboard.
 if(matchMedia('(pointer:coarse)').matches)heading.focus();else search.focus();
 results.querySelector<HTMLElement>('[aria-current=true]')?.scrollIntoView({block:'nearest'});
}
function buildDialog(){
 dialog=document.createElement('dialog');dialog.className='select-picker-dialog';dialog.id='select-picker-dialog';dialog.setAttribute('aria-labelledby','picker-title');
 const header=document.createElement('div');header.className='picker-header';heading=document.createElement('h2');heading.id='picker-title';heading.tabIndex=-1;
 close=document.createElement('button');close.type='button';close.className='picker-close';close.textContent='×';close.addEventListener('click',()=>dialog.close());header.append(heading,close);
 const searchBox=document.createElement('div');searchBox.className='picker-search';search=document.createElement('input');search.type='search';search.autocomplete='off';search.spellcheck=false;
 clear=document.createElement('button');clear.type='button';clear.className='picker-clear';clear.textContent='×';clear.addEventListener('click',()=>{search.value='';renderResults();search.focus();});searchBox.append(search,clear);
 count=document.createElement('p');count.className='picker-count';count.setAttribute('role','status');count.setAttribute('aria-live','polite');count.setAttribute('aria-atomic','true');
 results=document.createElement('ul');results.className='picker-results';results.setAttribute('aria-labelledby','picker-title');
 hint=document.createElement('p');hint.className='picker-hint';dialog.append(header,searchBox,count,results,hint);document.body.append(dialog);
 dialog.addEventListener('keydown',event=>{
  if(event.isComposing||event.keyCode===229)return;
  // type=search consumes Escape in some browsers; closing is our explicit
  // cancellation action, including when this dialog is above a restore dialog.
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.close();return;}
  if(event.key!=='Tab')return;
  const stops=[...dialog.querySelectorAll<HTMLElement>('button,input')].filter(node=>node.tabIndex>=0&&!node.hasAttribute('disabled')&&node.getClientRects().length);
  const first=stops[0],last=stops.at(-1),focused=document.activeElement;
  if((event.shiftKey&&(focused===first||focused===heading))||(!event.shiftKey&&focused===last)){event.preventDefault();(event.shiftKey?last:first)?.focus();}
 });
 search.addEventListener('input',renderResults);
 search.addEventListener('keydown',event=>{if(event.isComposing||event.keyCode===229)return;if(event.key==='ArrowDown'||event.key==='Enter'){event.preventDefault();const buttons=visibleButtons();if(event.key==='Enter'&&buttons.length===1)buttons[0].click();else focusResult(buttons[0]);}});
 results.addEventListener('keydown',event=>{
  const buttons=visibleButtons(),index=buttons.indexOf(document.activeElement as HTMLButtonElement);let next:number|undefined;
  if(event.key==='ArrowDown')next=Math.min(index+1,buttons.length-1);if(event.key==='ArrowUp')next=Math.max(index-1,0);if(event.key==='Home')next=0;if(event.key==='End')next=buttons.length-1;
  if(next!==undefined){event.preventDefault();focusResult(buttons[next]);}
 });
 let downOutside=false;const outside=(event:PointerEvent)=>{const rect=dialog.getBoundingClientRect();return event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom;};
 dialog.addEventListener('pointerdown',event=>{downOutside=event.target===dialog&&outside(event);});
 dialog.addEventListener('pointerup',event=>{if(downOutside&&event.target===dialog&&outside(event))dialog.close();downOutside=false;});
 dialog.addEventListener('close',()=>{
  const picker=active;active=undefined;document.documentElement.style.overflow=previousOverflow;
  if(picker){picker.trigger.setAttribute('aria-expanded','false');if(picker.trigger.isConnected&&!picker.trigger.disabled&&picker.trigger.getClientRects().length)picker.trigger.focus({preventScroll:true});}
 });
 window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);window.addEventListener('resize',viewport);
}
export function initPickers(){
 if(initialized||typeof HTMLDialogElement==='undefined')return;initialized=true;
 const selects=document.querySelectorAll<HTMLSelectElement>('select[data-searchable]');if(!selects.length)return;buildDialog();
 for(const select of selects){
  const label=select.closest('label'),caption=label?.querySelector<HTMLElement>('span');if(!label||!caption)continue;
  // A button must not share an implicit <label> with another labelable control.
  const field=document.createElement('div');for(const attr of [...label.attributes])field.setAttribute(attr.name,attr.value);field.classList.add('picker-field');field.append(...label.childNodes);label.replaceWith(field);
  const id=`picker-${pickers.size+1}`;caption.id=`${id}-label`;
  const wrapper=document.createElement('div');wrapper.className='select-picker';select.before(wrapper);wrapper.append(select);
  const trigger=document.createElement('button');trigger.type='button';trigger.dataset.pickerTrigger='';trigger.className='picker-trigger';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls',dialog.id);trigger.setAttribute('aria-expanded','false');
  const value=document.createElement('span');value.id=`${id}-value`;trigger.append(value);trigger.setAttribute('aria-labelledby',`${caption.id} ${value.id}`);
  const error=document.createElement('small');error.id=`${id}-error`;error.className='error picker-error';error.hidden=true;error.setAttribute('role','alert');wrapper.append(trigger,error);
  const picker={select,trigger,caption,value,error};pickers.set(select,picker);
  trigger.addEventListener('click',()=>openPicker(picker));
  trigger.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();openPicker(picker);}});
  select.addEventListener('change',()=>{if(select.validity.valid)error.hidden=true;refresh(picker);});
  select.addEventListener('invalid',event=>{event.preventDefault();error.hidden=false;refresh(picker);trigger.focus();});
  new MutationObserver(()=>{refresh(picker);if(active===picker)translateDialog();}).observe(select,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['disabled','aria-invalid','aria-describedby']});
  select.form?.addEventListener('reset',()=>queueMicrotask(()=>{error.hidden=true;refresh(picker);}));
  select.hidden=true;refresh(picker);
 }
 window.addEventListener('pickerrefresh',refreshPickers);
 window.addEventListener('languagechange',()=>queueMicrotask(()=>{refreshPickers();if(active)translateDialog();}));
}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initPickers,{once:true});else initPickers();
}
