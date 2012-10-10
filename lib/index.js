var structr = require("structr"),
EventEmitter = require("events").EventEmitter,
vine = require("vine"),
_ = require("underscore"),
crema = require("crema");


var Mapper = structr({

	/**
	 */

	"__construct": function(config) {
		this._registrar = config.registrar;
		this.connection = config.connection;
		this._waiting  = {};
		this._em       = new EventEmitter();
	},

	/**
	 */

	"restify": function(config, pre, parent) {

		this._fix(config);

		// if(config.pre) config.path = config.pre + "/" + config.path;
		if(pre) config.path = pre + "/" + config.path;

		var hasMany = config.hasMany,
		self        = this,
		pre         = config.pre,
		name        = config.name,
		cpath       = config.path,
		methods     = config.methods;


		methods.forEach(function(method) {
			self._registrar.register(method, config.path, config, parent);
		}); 

		//for each hasMany key
		hasMany.forEach(function(key) {

			var conf;

			function onHasMany(conf) {
				self.restify(conf, cpath + "/:" + name, config);
				delete self._waiting[key];
			}

			if(conf = self._waiting[key]) {
				onHasMany(conf);
			} else {
				self._em.once("hasMany-" + key, onHasMany);
			}
		});

	},

	/**
	 */

	"register": function(config, pre) {
		this._fix(config);
		this._waiting[config.name] = config;
		this._em.emit("hasMany-" + config.name, config);
	},

	/**
	 */

	"_fix": function(config) {
		//fix the config
		_.defaults(config, {
			model: config.name.substr(-1) === "s" ? config.name.substr(0, config.name.length-1) : config.name,
			pre: "",
			hasMany: [],
			methods: ["GET", "POST", "PUT", "DELETE"],
			path: config.name || config.model
		});
	}
});


var HttpRequestHandler = structr({

	/**
	 */

	"__construct": function(ops) {
		this._config = ops.config;
		this._connection = ops.connection;
		this._router = ops.router;
		this.name = ops.config.name;
		this.method = ops.method;
		this.model = ops.config.model;
		this.parent = ops.parent;
	},

	/**
	 */

	"listen": function() {
		var self = this;
		this._router.on("pull -method=" + this.method + " " + this._config.pre + " " + this._path(), function() {
			self._handleRequest.apply(self, arguments);
		});
	},

	/**
	 */

	"_model": function() {
		return this._connection.model(this.model);
	},



	/**
	 */

	"_path": function() { 
		return this._config.path;
	},

	/**
	 */

	"abstract _handleRequest": function(req, res, mw) { },

});

var ItemHandler = HttpRequestHandler.extend({

	/**
	 */

	"_handleRequest": function(req, res, mw) {
		var self = this;
		this._findOne(req, function(err, item) {
			if(err) return vine.error(err).end(res);
			self._onItem(item, req, res, mw);
		})
	},

	/**
	 */

	"_findOne": function(req, next) {
		var self = this;
		if(req.sanitized[self.model]) return next(null, req.sanitized[self.model]);
		this._model().findOne({ _id: req.params[this.model] }, function(err, item) {
			if(err || !item) return next(err || new Error(self.model + " \"" + req.params[self.model] + "\" does not exist"));
			req.sanitized[self.model] = item;
			return next(err, item);
		})
	},

	/**
	 */

	"_path": function() {
		return this._config.path + "/:" + this.model;
	},

	/**
	 */

	"abstract _onItem": function(item, res, mw) { },

});

var GETHandler = ItemHandler.extend({
	"override listen": function() {
		this._super();
		var self = this;
		this._router.on("pull " + this._path() + "/**", function() {
			self._handleRequest.apply(self, arguments);
		})
	},
	"_onItem": function(item, req, res, mw) {
		if(!mw.next()) vine.result(item).end(res);
	}
});

var GETAllHandler = HttpRequestHandler.extend({
	"_handleRequest": function(req, res) {
		var query = {}, parent, name = this.name;

		if(this.parent) {
			parent = req.sanitized[this.parent.model];
			query[this.parent.model] = parent._id;
		}

		var q = req.query,
		page = q.page || 0,
		limit = q.limit || 50;

		this._model().find(query).skip(page * limit).limit(limit).exec(function(err, items) {
			if(err) return vine.error(err).end(res);
			vine.result(items).end(res);
		});
	}
})

var PUTHandler = ItemHandler.extend({
	"_onItem": function(item, req, res, mw) {
		var update = req.body || req.query;
		_.extend(item, update);
		item.save(function(err) {
			if(err) return vine.error(err).end(res);
			vine.result(item).end(res);
		});
	}
});

var DELETEHandler = ItemHandler.extend({
	"_onItem": function(item, req, res, mw) {
		item.remove(function(err) {
			if(err) return vine.error(err).end(res);
			vine.result(item).end(res);
		});
	}
});

var POSTHandler = HttpRequestHandler.extend({
	"_handleRequest": function(req, res) {

		var parentItem,
		newItem = _.extend({}, req.body || req.query);

		if(this.parent) {
			newItem[this.parent.model] = req.sanitized[this.parent.model]._id;
		}

		var model = this._model(); 

		var item = new model(newItem);
		//TODO - tie DB refs
		item.save(function(err) {
			if(err) return vine.error(err).end(res);
			vine.result(item).end(res);
		});
	},
	"override _path": function() {
		return "parse/body -> " + this._super();
	}
});


var HttpRequestHandlerFactory = structr({

	/**
	 */

	"__construct": function() {
		this._handlers = {
			GET: [GETHandler, GETAllHandler],
			POST: [POSTHandler],
			PUT: [PUTHandler],
			DELETE: [DELETEHandler]
		};
	},

	/**
	 */

	"create": function(ops) {
		var handlers = this._handlers[ops.method];

		var group = [];
		handlers.forEach(function(clazz) {
			group.push(new clazz(ops));
		});

		return group.length === 1 ? group[0] : {
			listen: function() {
				group.forEach(function(handler) {
					handler.listen();
				});
			}
		};
	}
});



var BeanpollRegistrar = structr({

	/**
	 */

	"__construct": function(config) {
		this._router     = config.router;
		this._connection = config.connection; 
		this._factory = new HttpRequestHandlerFactory();
	},

	/**
	 */

	"register": function(method, path, config, parent) {
		this._factory.create({
			method: method,
			connection: this._connection,
			config: config,
			router: this._router,
			parent: parent
		}).listen();
	}
});


exports.init = function(config) {

	if(!config.registrar) config.registrar = new BeanpollRegistrar(config);

	return new Mapper(config || {});
}