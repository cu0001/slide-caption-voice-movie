"""Reconstruct editable layers from this project's original coffee SVG illustrations."""
from pathlib import Path
import base64
import io
import json
import math
import struct
import wave
import urllib.parse
import xml.etree.ElementTree as ET
root=Path(__file__).resolve().parent.parent
source=json.loads((root/'tests/fixtures/coffee-break-project.json').read_text())
ET.register_namespace('', 'http://www.w3.org/2000/svg')
art_rect={'x':730,'y':85,'width':480,'height':540}
clip={**art_rect,'radius':28}
# (name, svg child indices, entrance, start, entrance seconds, distance, loop)
groups=[
 [('陽だまり',[1],'zoom',.06,.8,0,'pulse'),('テーブル',[2],'slide-up',.04,.7,260,'none'),('カップの影',[3],'fade',.3,.6,0,'none'),('コーヒーカップ',[4,5,6,7],'pop',.35,.9,110,'sway'),('湯気',[8],'float',1.05,.8,60,'float')],
 [('窓の空',[1],'blur',.02,.8,0,'none'),('太陽',[2],'drop',.4,.9,420,'pulse'),('丘の景色',[3],'slide-up',.2,.7,260,'drift'),('窓枠',[4,5],'reveal',.5,.8,0,'none'),('窓辺の植物',[6,7,8,9],'slide-up',.8,.9,320,'sway')],
 [('背景の円',[1],'zoom',.02,.8,0,'pulse'),('机',[2],'slide-up',.03,.7,260,'none'),('ノート',[3,4],'slide-right',.25,.8,420,'none'),('鉛筆',[5],'reveal',1,.8,0,'none'),('コーヒーカップ',[6,7,8],'slide-left',.45,.9,420,'sway'),('湯気',[9],'float',1.25,.7,60,'float')],
]
SLIDE=6
headline=[('slide-up',.9,260),('blur',.9,0),('chars',.7,120)]
# Every scene is paced calmly, the window scene most: its entrances stretch, and the hand-offs into and out of it take longer.
pace=[1.5,1.9,1.5]
exit_seconds=[1.2,1.2,1.2]
slides=[]
for i,old in enumerate(source['slides']):
 svg=ET.fromstring(urllib.parse.unquote(old['image'].split(',',1)[1]));children=list(svg)
 last=i==len(source['slides'])-1
 elements=[]
 def add(name,type,start=0,animation='fade',enter=.7,exit='none',end=0,**values):
  # Every scene but the last leaves before the next one: text flies off first, then the art shrinks.
  start=round(start*pace[i],2);end=round(end*pace[i],2)
  element={'id':f'scene-{i+1}-element-{len(elements)+1}','name':name,'type':type,'start':start,'duration':round(SLIDE-end-start,2),'animation':animation,'enter':round(enter*pace[i],2),**values}
  if exit!='none' and not last:element.update(exit=exit,exitDuration=exit_seconds[i])
  elements.append(element)
 add('イラスト背景','shape',animation='zoom',enter=.6,exit='zoom',**art_rect,shape='rect',radius=28,color=children[0].attrib['fill'])
 for name,indices,animation,start,enter,distance,loop in groups[i]:
  body=''.join(ET.tostring(children[n],encoding='unicode') for n in indices)
  xml=f'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="900" viewBox="0 0 800 900">{body}</svg>'
  extra={'loop':loop} if loop!='none' else {}
  add(name,'image',start,animation,enter,'zoom',**art_rect,src='data:image/svg+xml;charset=utf-8,'+urllib.parse.quote(xml),clip=clip,distance=distance,**extra)
 animation,enter,distance=headline[i]
 add('小見出し','text',.03,'chars',.5,'slide-left',.35,x=80,y=83,width=610,height=35,text=old['eyebrow'],fontSize=17,fontWeight=550,color=old['color'],distance=30)
 add('見出し','text',.18,animation,enter,'slide-left',.3,x=76,y=205,width=610,height=225,text=['香りを、\nひとつ。','窓辺で、\nゆっくり。','今日に、\n余白を。'][i],fontSize=76,fontWeight=650,color='#f3f2e8',distance=distance)
 add('見出しのライン','shape',.72,'reveal',.75,'slide-left',.25,x=80,y=433,width=88,height=4,shape='rect',color=old['color'])
 add('本文','text',1,'lines',.6,'slide-left',.2,x=80,y=477,width=610,height=110,text=['お気に入りの一杯で、\n小さな休憩を。','あわただしい時間を、\n少しだけほどいて。','ひと息ついたら、\nまた自分のペースで。'][i],fontSize=27,fontWeight=450,color='#bdcdc2',distance=90)
 add('フッター','text',.5,'fade',.5,'fade',.2,x=80,y=648,width=610,height=25,text=f'{i+1:02d} / COFFEE BREAK',fontSize=13,color='#7e9a8e')
 slides.append({**old,'duration':SLIDE,'layout':'layers','elements':elements,'transition':'fade'})
def soundtrack(seconds,rate=48000):
 """The demo chord bed, stretched to one chord per scene with a slow breath and a long fade-out."""
 chords=[[220,277.1826,329.6276],[196,246.9417,293.6648],[174.6141,220,261.6256]]
 out=io.BytesIO()
 with wave.open(out,'wb') as w:
  w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate)
  frames=bytearray()
  for n in range(int(seconds*rate)):
   t=n/rate;chord=chords[min(len(chords)-1,int(t//SLIDE))]
   envelope=min(t/.4,1)*min((seconds-t)/1.5,1)*(.7+.3*math.sin(math.pi*(t%3)/3)**2)
   frames+=struct.pack('<h',int(sum(math.sin(2*math.pi*f*t) for f in chord)/3*.14*envelope*32767))
  w.writeframes(bytes(frames))
 return 'data:audio/wav;base64,'+base64.b64encode(out.getvalue()).decode()
project={**source,'name':'ひと息のコーヒー時間｜要素別アニメーション','slides':slides,'audio':{**source['audio'],'src':soundtrack(SLIDE*len(slides)),'start':0}}
for folder in [root/'public/examples']:
 folder.mkdir(parents=True,exist_ok=True)
 (folder/'coffee-elements-project.json').write_text(json.dumps(project,ensure_ascii=False,indent=2)+'\n')
print('Created',sum(len(s['elements']) for s in slides),'editable elements in',len(slides),'scenes')
