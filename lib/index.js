/**
 * Module dependencies
 */

var Remote = require('remotes').github;

/**
 * Load credentials from env
 */

var GITHUB_USERNAME = process.env.GITHUB_USERNAME;
var GITHUB_PASSWORD = process.env.GITHUB_PASSWORD;

/**
 * Expose GitHubPrivate
 */

module.exports = GitHubContentAPI;

/**
 * Extend GitHub Remote
 */

Remote.extend(GitHubContentAPI);

/**
 * Create a GitHub content API remote
 *
 * @param {Object} opts
 */

function GitHubContentAPI(opts) {
  if (!(this instanceof GitHubContentAPI)) return new GitHubContentAPI(opts);

  opts = Object.create(opts || {});

  if (!opts.auth && GITHUB_USERNAME && GITHUB_PASSWORD) opts.auth = GITHUB_USERNAME + ':' + GITHUB_PASSWORD;

  this._host = opts.host || 'https://api.github.com';

  Remote.call(this, opts);

  this._request = this.request;
  delete this.request;
}

/**
 * Set the public name
 */

GitHubContentAPI.prototype.name = 'github-content-api';

/**
 * Override the file method to return urls from the content api
 *
 * @doc https://developer.github.com/v3/repos/contents/#get-contents
 */

GitHubContentAPI.prototype.file = function(repo, ref, path) {
  if (typeof path === 'object') path = path.path;
  var tail = repo + '/' + ref + '/' + path;
  return [
    'https://raw.githubusercontent.com/' + tail,
    'https://raw.github.com/' + tail,
    this._host + '/repos/' + repo + '/contents/' + path + '?ref=' + ref
  ];
};

/**
 * Monkey patch the request method to set the headers and check the rate limit
 */

GitHubContentAPI.prototype.request = function* (uri, opts) {
  if (~uri.indexOf('raw.github')
      || ~uri.indexOf('/tarball')
      || ~uri.indexOf('/zipball')) return yield* this._request(uri, opts);

  var json;
  if (opts === true) json = opts = {};
  if (!opts.headers) opts.headers = {};
  opts.headers.accept = 'application/vnd.github.v3.raw';
  opts.buffer = true;
  opts.string = !!json;

  var res = yield* this._request(uri, opts);

  if (json) try {
    res.body = JSON.parse(res.text);
  } catch (err) {
    console.error('error parsing', uri);
    throw err;
  }

  if (res.statusCode === 403) return errorRateLimitExceeded(res);
  if (res.statusCode === 401) return errorBadCredentials(res);
  checkRateLimitRemaining(res);

  return res;
};

/**
 * Better error message when rate limit exceeded.
 *
 * @param {Object} response
 * @api private
 */

function errorRateLimitExceeded(res) {
  var err = new Error('GitHub rate limit exceeded.');
  err.res = res;
  err.remote = 'github-content-api';
  throw err;
}

/**
 * Warn when rate limit is low.
 *
 * @param {Object} response
 * @api private
 */

function checkRateLimitRemaining(res) {
  var remaining = parseInt(res.headers['x-ratelimit-remaining'], 10);
  if (remaining <= 50) {
    console.warn('github-content-api remote: only %d requests remaining.', remaining);
  }
}

/**
 * Better error message when credentials are not supplied.
 *
 * @param {Object} response
 * @api private
 */

function errorBadCredentials(res) {
  var err = new Error('Invalid credentials');
  err.res = res;
  err.remote = 'github-content-api';
  throw err;
}
