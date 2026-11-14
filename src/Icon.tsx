// Small line icons drawn here, so the controls look the same on every system (the old ▶ Ⅱ ⛶ glyphs depended on its fonts).
const paths={
 play:<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>,
 pause:<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none"/>,
 sound:<><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" stroke="none"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/></>,
 muted:<><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" stroke="none"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></>,
 fullscreen:<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>,
 undo:<path d="M8 6L3.5 10.5 8 15M4 10.5h10a5.5 5.5 0 0 1 0 11h-3"/>,
 redo:<path d="M16 6l4.5 4.5L16 15M20 10.5H10a5.5 5.5 0 0 0 0 11h3"/>,
 previous:<path d="M14.5 5.5L8 12l6.5 6.5"/>,
 next:<path d="M9.5 5.5L16 12l-6.5 6.5"/>,
} as const;
export function Icon({name,size=18}:{name:keyof typeof paths;size?:number}){
 return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
