# bookityServer
Node.js server that provides an API for the Bookity app, using MongoDB for its database. 
Maybe the most interesting thing about it is that it uses a machine learning algorithm for recommending books to users based on the preferences of similar users, algorithm which is stronlgy based on Spotify's one for recommending songs given that we actually reverse engineered it from a blog post describing the overall workings of Spotify's system (and our algorithm is probably missing several details compared to theirs).
I'm aware that running huge matrix operations on a single-threaded Node.js server is not the best idea, but this was just a prototype built quickly in the 36 hours the hackathon lasted.


Built for HackUPC Fall 2017 (Barcelona-based hackathon).

If you want to run it, just install mongodb and nodejs, npm install all the dependencies from the requires and "nodejs index.js".
