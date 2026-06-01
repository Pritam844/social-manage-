export class Router {
  constructor(routes, authCheck) {
    this.routes = routes;
    this.authCheck = authCheck;
    
    window.addEventListener('hashchange', () => this.handleRoute());
    window.addEventListener('load', () => this.handleRoute());
  }

  handleRoute() {
    const hash = window.location.hash || '#dashboard';
    
    let matchedRoute = null;
    let params = {};

    for (const route of Object.keys(this.routes)) {
      // Match something like #workshop/:id
      const regexPath = route.replace(/\/:([^\/]+)/g, '/([^\\/]+)');
      const regex = new RegExp(`^${regexPath}$`);
      const match = hash.match(regex);
      
      if (match) {
        matchedRoute = route;
        const paramNames = (route.match(/\/:([^\/]+)/g) || []).map(p => p.slice(2));
        paramNames.forEach((name, index) => {
          params[name] = match[index + 1];
        });
        break;
      }
    }

    if (!matchedRoute) {
      window.location.hash = '#dashboard';
      return;
    }

    const isProtectedRoute = !['#login', '#register', '#forgot-password'].includes(matchedRoute);
    const isLoggedIn = this.authCheck();

    if (isProtectedRoute && !isLoggedIn) {
      window.location.hash = '#login';
      return;
    }

    if (!isProtectedRoute && isLoggedIn) {
      window.location.hash = '#dashboard';
      return;
    }

    this.routes[matchedRoute](params);
  }

  navigate(hash) {
    window.location.hash = hash;
  }
}
