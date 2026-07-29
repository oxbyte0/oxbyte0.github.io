(function(){try{
  var t=localStorage.getItem('theme')||(window.matchMedia('(prefers-color-scheme:light)').matches?'light':'dark');
  document.documentElement.style.colorScheme=t;
  document.documentElement.dataset.theme=t;
  var a=localStorage.getItem('a11y');
  if(a){a.split(' ').forEach(function(c){if(c)document.documentElement.classList.add(c);});}
  var fl=document.getElementById('fonts-css');
  if(fl)fl.media='all';
}catch(e){}}());
