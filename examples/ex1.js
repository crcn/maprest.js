var beanpoll = require("beanpoll"),
router = beanpoll.router(),
mongoose = require("mongoose"),
Schema = mongoose.Schema;



var map = require("../").init({
	router: router,
	connection: mongoose.connect("mongodb://localhost:27017/auth")
});

map.connection.model("post", new Schema({
	title: String,
	message: String,
	comments: [{ type: Schema.Types.ObjectId, ref: 'comment' }]
}));

map.connection.model("comment", new Schema({
	title: String,
	message: String,
	post: { type: Schema.Types.ObjectId, ref: 'post' },
	comments: [{ type: Schema.Types.ObjectId, ref: 'comment' }]
}));


map.register({
	name: "comments",
	// hasMany: ["comments"]
});


map.restify({
	name: "posts",
	search: function(req, res) {

	},
	hasMany: ["comments"]
});



router.request("posts/50758209b1b46b7258000002/comments/50758d7de39739b55c000002").query({title:"test",message:"comment"}).tag({method:"DELETE"}).success(function(item) {
	console.log(item);
}).pull();
// router.request("posts").query({title:})