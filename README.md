```javascript

//mongoose schema

var maprest = require('maprest');

var Comment = {
	title : String,
	body  : String,
	date  : Date
};


var BlogPost = {
	author   : ObjectId,
	title    : String,
	body     : String
};



//mapped to:
//posts/:post
//posts/:post/comments/:comment
var mapper = maprest({
	name: 'post',
	schema: BlogPost,
	methods: ['GET','POST','PUT']
	hasMany: {
		name: 'comment',
		schema: Comment
	}
});


```



### Api

### .transform.mongooseSchema(options)


