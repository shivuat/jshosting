(function() {
  alert('Script loaded successfully!');
  var p = document.createElement('p');
  p.innerText = 'This script was loaded from an external source and executed successfully.';
  p.style = 'position:fixed;top:10px;left:10px;padding:10px;background:lightblue;z-index:9999;';
  document.body.appendChild(p);
})();
