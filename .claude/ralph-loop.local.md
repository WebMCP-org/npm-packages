---
active: true
iteration: 1
max_iterations: 0
completion_promise: null
started_at: "2026-01-10T18:22:34Z"
---

I'm iteratively improving the skill for the webmcp injection that you can look at the stage changes see what we've worked on. Basically, we've added the ability to script any website from Claude Code via WebMCP tools and then package it as a skill that tells the model how to use the WebMCP tools.
The flow is:
1. The model clones down the repo
2. It has the Chrome DevTools MCP server attached to its session
3. This Chrome DevTools MCP server allows it to inject and call tools that adds to the page
It tries to match feature parity with what the human can do, so all the features it can do, it explains everything and resources and skills in there. It's an iterative process where the Claude Code builds tools and you iterate in the skill until it has it perfectly captures all of the actions and all of describes how to do them inside of the skill.
This repo will be republished under GitHub by whoever clones the repo as a skill for this website. So I wanna keep iterating. What I want you to do is create a sub-agent, tell it to clone this template repo to attempt a temporary repo, iterate on it, try it out on Hacker News or whatever website you give it. It'll iterate, keep iterating, and then you'll have to ask it if any, what feedback it has, what thinks would be more clear, things like that. Make sure that you tell the sub-agent that has a very clear scope so it knows that once it goes for a while it'll stop and it can only work inside of this temporary directory. And then it'll give you suggestions on things to add upstream if it created any helpers, it could tell you about that, and then you'll update the base repo, the base template, and the base with like the skill for descriptions about how to do things, and then go from there. Keep trying websites.
