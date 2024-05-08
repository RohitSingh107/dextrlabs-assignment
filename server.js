const express = require("express");
const { graphqlHTTP } = require("express-graphql");
const { buildSchema } = require("graphql");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");

const app = express();

app.use(bodyParser.json());

// MongoDB connection
mongoose
  .connect("mongodb://mongodb:27017/blog", {
    // .connect("mongodb://localhost:27017/blog", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));

// MongoDB Schemas
const UserSchema = new mongoose.Schema({
  username: String,
  password: String,
});

const BlogPostSchema = new mongoose.Schema({
  title: String,
  content: String,
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
});

const CommentSchema = new mongoose.Schema({
  content: String,
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BlogPost",
  },
});

const User = mongoose.model("User", UserSchema);
const BlogPost = mongoose.model("BlogPost", BlogPostSchema);
const Comment = mongoose.model("Comment", CommentSchema);

// GraphQL schema
const schema = buildSchema(`
  type User {
    _id: ID!
    username: String!
    password: String
  }

  type BlogPost {
    _id: ID!
    title: String!
    content: String!
    author: User!
  }

  type Comment {
    _id: ID!
    content: String!
    author: User!
    post: BlogPost!
  }

  type Query {
    posts: [BlogPost!]!
    post(id: ID!): BlogPost
    comments(postId: ID!, page: Int, limit: Int): [Comment!]!
  }

  type Mutation {
    register(username: String!, password: String!): String!
    login(username: String!, password: String!): String!
    createPost(title: String!, content: String!): String!
    updatePost(id: ID!, title: String, content: String): String!
    deletePost(id: ID!): String!
    createComment(postId: ID!, content: String!): String!
  }
`);

// Verify JWT middleware
const verifyToken = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, "secret");
      return decoded.userId;
    } catch (error) {
      throw new Error("Invalid or expired token");
    }
  }
  throw new Error("Authentication token must be provided");
};

// Root resolver
const root = {
  // Query resolvers
  posts: async () => {
    return await BlogPost.find().populate("author", "username");
  },
  post: async ({ id }) => {
    return await BlogPost.findById(id).populate("author", "username");
  },
  comments: async ({ postId, page = 1, limit = 10 }) => {
    const options = {
      skip: (page - 1) * limit,
      limit: parseInt(limit, 10),
      populate: { path: "author", select: "username" },
      sort: { createdAt: -1 },
    };
    return await Comment.find({ post: postId }, {}, options);
  },

  // Mutation resolvers
  register: async ({ username, password }) => {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      throw new Error("User already exists");
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    return "User registered successfully";
  },
  login: async ({ username, password }) => {
    const user = await User.findOne({ username });
    if (!user) {
      throw new Error("Invalid username or password");
    }
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      throw new Error("Invalid username or password");
    }
    return jwt.sign({ userId: user._id }, "secret", { expiresIn: "1h" });
  },
  createPost: async ({ title, content }, req) => {
    const userId = verifyToken(req);
    const post = new BlogPost({ title, content, author: userId });
    await post.save();
    return "Post created successfully";
  },
  updatePost: async ({ id, title = "", content = "" }, req) => {
    const userId = verifyToken(req);
    const post = await BlogPost.findById(id);
    if (!post) {
      throw new Error("Post not found");
    }
    if (post.author.toString() !== userId) {
      throw new Error("Forbidden");
    }
    if (title != "") {
      post.title = title;
    }
    if (content != "") {
      post.content = content;
    }
    await post.save();
    return "Post updated successfully";
  },
  deletePost: async ({ id }, req) => {
    const userId = verifyToken(req);
    const post = await BlogPost.findById(id);
    if (!post) {
      throw new Error("Post not found");
    }
    if (post.author.toString() !== userId) {
      throw new Error("Forbidden");
    }
    await post.deleteOne();
    return "Post deleted successfully";
  },
  createComment: async ({ postId, content }, req) => {
    const userId = verifyToken(req);
    const post = await BlogPost.findById(postId);
    if (!post) {
      throw new Error("Post not found");
    }
    const comment = new Comment({ content, author: userId, post: post._id });
    await comment.save();
    return "Comment added successfully";
  },
};

app.use(
  "/graphql",
  (req, res, next) => {
    try {
      if (
        !String(req.body.query).includes("login") &&
        !String(req.body.query).includes("register")
      ) {
        verifyToken(req);
      }
      next();
    } catch (error) {
      res.status(401).json({ message: error.message });
    }
  },
  graphqlHTTP({
    schema: schema,
    rootValue: root,
    graphiql: true,
  })
);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
