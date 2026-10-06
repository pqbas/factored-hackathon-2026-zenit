// CloudFront Function (viewer request) of the front's behavior: a route of
// the app (/chat/1, /conversations) has no file extension, so it gets
// index.html; files (/assets/x.js, /favicon.ico) pass as they are. /api/* and
// /ping never get here: they have their own behavior.
function handler(event) {
  var request = event.request;
  var last = request.uri.split('/').pop();
  if (last.indexOf('.') === -1) request.uri = '/index.html';
  return request;
}
