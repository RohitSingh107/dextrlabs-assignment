const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoosePagination = require("mongoose-paginate");

const app = express();

app.use(bodyParser.json());

// MongoDB connection
mongoose
  // .connect("mongodb://localhost:27017/blog", {
  .connect("mongodb://mongodb:27017/blog", {
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

CommentSchema.plugin(mongoosePagination);

UserSchema.index({ username: 1 }, { unique: true });
BlogPostSchema.index({ title: "text", content: "text" });
CommentSchema.index({ post: 1 });

const User = mongoose.model("User", UserSchema);
const BlogPost = mongoose.model("BlogPost", BlogPostSchema);
const Comment = mongoose.model("Comment", CommentSchema);

// Routes
// Register a new user
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  const existingUser = await User.findOne({ username });
  if (existingUser) {
    return res.status(400).json({ message: "User already exists" });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ username, password: hashedPassword });
  await user.save();
  res.json({ message: "User registered successfully" });
});

// Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) {
    return res.status(400).json({ message: "Invalid username or password" });
  }
  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res.status(400).json({ message: "Invalid username or password" });
  }
  const token = jwt.sign({ userId: user._id }, "secret");
  res.json({ token });
});

// Middleware for authentication
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  jwt.verify(token, "secret", (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Forbidden" });
    }
    req.user = user;
    next();
  });
}

// Get all blog posts
app.get("/posts", authenticateToken, async (req, res) => {
  const posts = await BlogPost.find().populate("author", "username");
  res.json(posts);
});

// Get a single blog post
app.get("/posts/:id", authenticateToken, async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id).populate(
      "author",
      "username"
    );
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }
    res.json(post);
  } catch (err) {
    return res.status(404).json({ message: "Post not found" });
  }
});

// Create a new blog post
app.post("/posts", authenticateToken, async (req, res) => {
  const { title, content } = req.body;
  console.log("content is", content);
  const post = new BlogPost({ title, content, author: req.user.userId });
  await post.save();
  res.json({ message: `Post created successfully with id ${post.id}` });
});

// Update a blog post
app.put("/posts/:id", authenticateToken, async (req, res) => {
  try {
    const { title, content } = req.body;
    const post = await BlogPost.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }
    if (post.author.toString() !== req.user.userId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    post.title = title;
    post.content = content;
    await post.save();
    res.json({ message: "Post updated successfully" });
  } catch (err) {
    return res.status(404).json({ message: "Post not found" });
  }
});

// Delete a blog post
app.delete("/posts/:id", authenticateToken, async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }
    if (post.author.toString() !== req.user.userId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    await post.deleteOne();
    res.json({ message: "Post deleted successfully" });
  } catch (err) {
    return res.status(404).json({ message: "Post not found" });
  }
});

// Create a new comment
app.post("/posts/:id/comments", authenticateToken, async (req, res) => {
  const { content } = req.body;
  const post = await BlogPost.findById(req.params.id);
  if (!post) {
    return res.status(404).json({ message: "Post not found" });
  }
  const comment = new Comment({
    content,
    author: req.user.userId,
    post: post._id,
  });
  await comment.save();
  res.json({ message: "Comment added successfully" });
});

// Get comments for a blog post
app.get("/posts/:id/comments", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const options = {
    skip: (page - 1) * limit,
    limit: parseInt(limit, 10),
    populate: { path: "author", select: "username" },
    // sort: { createdAt: -1 },
  };
  const comments = await Comment.find({ post: id }, {}, options).exec();
  const totalComments = await Comment.countDocuments({ post: id });
  res.json({ comments, totalComments });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
