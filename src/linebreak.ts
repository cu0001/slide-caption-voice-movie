/**
 * Splits Japanese text into phrases a line may end after ("カップに、" / "淹れたての" / "コーヒー。").
 * The built-in word segmenter cuts finer than a reader would ("淹|れ|た|て|の"), so particles, verb
 * endings, punctuation and counters are joined back onto the word they belong to.
 */
const OPEN='（(「『【〔［[｛{〈《“‘',HIRAGANA=/^[ぁ-ゖー]+$/,KANJI=/[一-鿿々]/,DIGIT=/[0-9０-９]$/;
/** Hiragana words of three or more letters that follow another word rather than start a phrase. */
const ENDINGS=new Set(['ながら','ですが','ますが','ました','ません','でした','でしょう','ましょう','けれど','けれども','ください','られる','られた','させる','ている','ていく','てくる','として','について','によって','という','ところ','くらい','ぐらい','ばかり','なので','だった','なかっ','たかっ','だから','ならば','ので','のに']);
let segmenter:Intl.Segmenter|undefined;
export function phrases(text:string):string[]{
 segmenter??=new Intl.Segmenter('ja',{granularity:'word'});
 const out:string[]=[];
 for(const {segment,isWordLike} of segmenter.segment(text)){
  const prev=out[out.length-1];
  const joins=prev!==undefined&&!/\s$/.test(prev)&&(
   OPEN.includes(prev[prev.length-1])                                  // 「 stays with the word it opens
   ||/^\s/.test(segment)                                                // spaces hang on the line end
   ||(!isWordLike&&!OPEN.includes(segment[0]))                          // 、。）% and other marks
   ||(HIRAGANA.test(segment)&&!/[、。！？!?，,．]$/.test(prev)&&(segment.length<=2||ENDINGS.has(segment))) // particles and endings
   ||(segment.length===1&&KANJI.test(segment)&&KANJI.test(prev[prev.length-1])) // 前年|比, 2024年|度
   ||(DIGIT.test(prev)&&Array.from(segment).length<=2)                  // 3つ, 20個, 60秒
   ||(/[×x\/:.\-+@#＃$¥]$/.test(prev)&&/^[0-9A-Za-z０-９]/.test(segment))  // 1280×720
   ||(/[!-~]$/.test(prev)&&/^[!-~]/.test(segment)));                    // v1.0, e-mail
  if(joins)out[out.length-1]+=segment;else out.push(segment);
 }
 return out;
}
/** Characters that must not start a line; used when one phrase is wider than the line and has to be cut. */
const NO_START=/^[、。，．,.！？!?）)」』】〕］\]｝}〉》”’・：；:;ー～…‥ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々ゝゞ%％\s]/;
/**
 * Wraps `text` at phrase ends. `measure` returns a string's width. With `balance`, lines of a
 * paragraph are evened out without adding lines, so a subtitle is not one full line plus two letters.
 */
export function wrapPhrases(text:string,width:number,measure:(s:string)=>number,balance=false):string[]{
 const lines:string[]=[];
 for(const para of text.split('\n')){
  // Phrases wider than a whole line are cut by letter, keeping punctuation off the line start.
  const units=phrases(para).flatMap(p=>{
   if(measure(p.trimEnd())<=width)return[p];
   // Equal pieces, so the cut does not leave one or two letters alone on a line.
   const total=measure(p.trimEnd()),limit=Math.min(width,total/Math.ceil(total/width)+measure('あ'));
   const parts:string[]=[];let part='';
   for(const char of Array.from(p)){if(part&&!NO_START.test(char)&&measure(part+char)>limit){parts.push(part);part=char;}else part+=char;}
   parts.push(part);return parts;
  });
  const fill=(limit:number)=>{
   const out:string[]=[];let line='';
   for(const unit of units){if(line&&measure((line+unit).trimEnd())>limit){out.push(line.trimEnd());line=unit;}else line+=unit;}
   out.push(line.trimEnd());return out;
  };
  let best=fill(width);
  if(balance&&best.length>1){
   let low=Math.max(...units.map(u=>measure(u.trimEnd()))),high=width;
   while(high-low>4){const mid=(low+high)/2;if(fill(mid).length<=best.length)high=mid;else low=mid;}
   const even=fill(high);if(even.length===best.length)best=even;
  }
  lines.push(...best);
 }
 return lines;
}
