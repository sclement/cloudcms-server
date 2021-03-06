var path = require('path');
var util = require('../../util/util');

/**
 * Sets req.domainHost onto request.
 * Sets req.virtualHost onto request.
 *
 * @type {Function}
 */
exports = module.exports = function()
{
    var push = function(candidates, text)
    {
        if (text)
        {
            var z = text.indexOf(",");
            if (z > -1)
            {
                var array = text.split(",");
                for (var i = 0; i < array.length; i++)
                {
                    candidates.push(util.trim(array[i]));
                }
            }
            else
            {
                candidates.push(text);
            }
        }
    };

    var r = {};

    /**
     * @return {Function}
     */
    r.hostInterceptor = function() {

        return function(req, res, next) {

            var _virtualHost = process.env.CLOUDCMS_VIRTUAL_HOST;
            if (!_virtualHost)
            {
                // see if we can process for a virtual host domain
                var virtualHostDomain = process.env.CLOUDCMS_VIRTUAL_HOST_DOMAIN;
                if (virtualHostDomain)
                {
                    // collect all of the candidates
                    var candidates = [];

                    // X-FORWARDED-HOST
                    var xForwardedHost = null;
                    if (req.header("X-Forwarded-Host"))
                    {
                        xForwardedHost = req.header("X-Forwarded-Host");
                    }
                    else if (req.header("x-forwarded-host"))
                    {
                        xForwardedHost = req.header("x-forwarded-host");
                    }
                    else if (req.header("X-FORWARDED-HOST"))
                    {
                        xForwardedHost = req.header("X-FORWARDED-HOST");
                    }
                    push(candidates, xForwardedHost);

                    // CUSTOM HOST HEADER
                    if (process.configuration && process.configuration.host)
                    {
                        if (process.configuration.host.hostHeader)
                        {
                            var customHost = req.header[process.configuration.host.hostHeader];
                            push(candidates, customHost);
                        }
                    }

                    // REQ.HOSTNAME
                    push(candidates, req.hostname);

                    // find the one that is for our virtualHostDomain
                    for (var x = 0; x < candidates.length; x++)
                    {
                        // keep only those that are subdomains of our intended parent virtualHostDomain (i.e. "cloudcms.net")
                        if (candidates[x].toLowerCase().indexOf(virtualHostDomain) > -1)
                        {
                            _virtualHost = candidates[x];
                            break;
                        }
                    }
                    //console.log("Resolved host: " + host);

                    // if none, take first one that is not an IP address
                    if (!_virtualHost)
                    {
                        if (candidates.length > 0)
                        {
                            for (var i = 0; i < candidates.length; i++)
                            {
                                if (!util.isIPAddress(candidates[i]))
                                {
                                    _virtualHost = candidates[i];
                                    break;
                                }
                            }
                        }
                    }

                    // strip out port if it's somehow on host
                    if (_virtualHost && _virtualHost.indexOf(":") > -1)
                    {
                        _virtualHost = _virtualHost.substring(0, _virtualHost.indexOf(":"));
                    }
                }
            }

            // base case
            req.domainHost = req.hostname;
            req.virtualHost = process.env.CLOUDCMS_STANDALONE_HOST;

            // virtual mode
            if (_virtualHost)
            {
                req.virtualHost = _virtualHost;
            }

            // virtualHost is the host that we manage on disk
            // multiple real-world hosts might map into the same virtual host
            // for example, "abc.cloudcms.net and "def.cloudcms.net" could connect to Cloud CMS as a different tenant
            // process.env.CLOUDCMS_STANDALONE_HOST means that gitana.json is provided manually, no virtualized connections

            next();
        };
    };

    return r;
}();
