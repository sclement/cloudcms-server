var path = require('path');
var fs = require('fs');

var mkdirp = require('mkdirp');

/**
 * Supports the following directory structure:
 *
 *
 *   /hosts
 *
 *      /abc.cloudcms.net
 *
 *         /public
              index.html
 *
 *         /content
 *            /local
 *               /en_us
 *                  image.jpg
 *
 *            /cloudcms
 *               /<branchId>
 *                  /en_us
 *                     image.jpg
 *
 * @type {exports}
 */
exports = module.exports = function()
{
    // this is the root path where hosts, their public files and content caches are stored
    var basePath = process.env.CLOUDCMS_HOSTS_PATH;
    if (!basePath) {
        basePath = "/hosts";
    }

    // subsystems
    var deployment = require("./lib/deployment/deployment")(basePath);
    var virtualHost = require("./lib/virtualhost/virtualhost")(basePath);
    var authorization = require("./lib/authorization/authorization")(basePath);
    var cloudcms = require("./lib/cloudcms/cloudcms")(basePath);
    var cms = require("./lib/cms/cms")(basePath);
    var local = require("./lib/local/local")(basePath);
    var libraries = require("./lib/libraries/libraries")(basePath);

    // config service
    var config = require("./lib/config")(basePath);

    // init
    if (!process.env.GITANA_PROXY_HOST) {
        process.env.GITANA_PROXY_HOST = "127.0.0.1";
    }
    if (!process.env.GITANA_PROXY_PORT) {
        process.env.GITANA_PROXY_PORT = 8080;
    }
    if (!process.env.CLOUDCMS_HOSTS_PATH) {
        process.env.CLOUDCMS_HOSTS_PATH = "/hosts";
    }

    // assume local path of "." if none provided
    if (!process.env.CLOUDCMS_DEFAULT_ROOT_PATH) {
        //process.env.CLOUDCMS_DEFAULT_ROOT_PATH = ".";
        process.env.CLOUDCMS_DEFAULT_ROOT_PATH = process.cwd();
        console.log("cloudcms default root path: " + process.env.CLOUDCMS_DEFAULT_ROOT_PATH);
    }

    if (!process.env.CLOUDCMS_DEFAULT_PUBLIC_PATH) {
        process.env.CLOUDCMS_DEFAULT_PUBLIC_PATH = path.join(process.env.CLOUDCMS_DEFAULT_ROOT_PATH, "public");
        console.log("cloudcms default public path: " + process.env.CLOUDCMS_DEFAULT_PUBLIC_PATH);
    }

    var r = {};

    r.beanstalk = function()
    {
        if (process.env.PARAM1) {
            process.env.CLOUDCMS_HOSTS_PATH = process.env.PARAM1;
        }
        if (process.env.PARAM2) {
            process.env.GITANA_PROXY_HOST = process.env.PARAM2;
        }
        if (process.env.PARAM3) {
            process.env.GITANA_PROXY_PORT = process.env.PARAM3;
        }
    };

    r.interceptors = function(app, includeCloudCMS)
    {
        // determines whether the incoming request points to a virtual host and configures request
        app.use(virtualHost.interceptor());

        if (includeCloudCMS) {

            // ensure that a gitana driver instance is bound to the request
            app.use(cloudcms.driverInterceptor());

            // auto-select which gitana repository to use
            app.use(cloudcms.repositoryInterceptor());

            // auto-select which gitana branch to use
            // allows for branch specification via request parameter
            app.use(cloudcms.branchInterceptor());

            // enables ICE menu
            app.use(cloudcms.iceInterceptor());
        }

        // cms (tag procesing, injection of scripts, etc, kind of a catch all at the moment)
        app.use(cms.interceptor());
    };

    r.handlers = function(app, includeCloudCMS)
    {
        // handles deploy/undeploy commands
        app.use(deployment.handler());

        // handles the retrieval of configuration
        app.use(config.handler());

        // libraries
        app.use(libraries.handler());

        if (includeCloudCMS) {

            // cloudcms domain principal authentication
            app.use(cloudcms.authenticationHandler(app));

            // handles virtualized content retrieval from Cloud CMS
            app.use(cloudcms.virtualHandler());
        }

        // handles virtualized local content retrieval from disk
        app.use(local.virtualHandler());

        // handles default content retrieval from disk
        app.use(local.defaultHandler());

    };

    r.bodyParser = function()
    {
        return function(req, res, next)
        {
            if (req.method.toLowerCase() == "post") {

                var responseString = "";

                req.on('data', function(data) {
                    responseString += data;
                });

                req.on('end', function() {

                    if (responseString.length > 0) {

                        try {
                            req.body = JSON.parse(responseString);
                        } catch (e) { }
                    }

                    next();
                });
            }
            else
            {
                next();
            }
        };
    };

    return r;
}();
