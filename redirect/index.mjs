export default {
  fetch(request) {
    const incoming = new URL(request.url);
    const destination = new URL('https://rexy.baememory.com');
    destination.pathname = incoming.pathname;
    destination.search = incoming.search;
    return Response.redirect(destination.href, 302);
  },
};
