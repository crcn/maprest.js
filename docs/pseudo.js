var map = require("maprest").init(router);



map.register({
	model: "items"
});


map.restify({
	model: "groups",
	pre: "auth -> ",
	path: "groups/test",
	hasMany: {
		"items": "items"
	}
});
