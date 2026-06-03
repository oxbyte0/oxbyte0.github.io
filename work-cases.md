---
layout: template
title: Work Cases
description: SOC analysis, pentest engagements, and real-world security research by oxbyte
permalink: /work-cases/
---

# Work Cases

{% assign work_posts = site.categories.Work %}
{% if work_posts.size > 0 %}
  {% for post in work_posts %}
  <article class="post-card">
    <div class="post-card-body">
      <div class="post-card-meta">
        <time>{{ post.date | date: "%Y-%m-%d" }}</time>
        {% for tag in post.tags %}
          {% if tag contains "type/" %}<span class="badge badge-os">{{ tag | remove: 'type/' }}</span>{% endif %}
          {% if tag contains "diff/" %}<span class="badge badge-{{ tag | remove: 'diff/' }}">{{ tag | remove: 'diff/' }}</span>{% endif %}
        {% endfor %}
      </div>
      <h3 class="post-card-title"><a href="{{ post.url }}">{{ post.title }}</a></h3>
      {% if post.description %}<p class="post-card-desc">{{ post.description | truncate: 160 }}</p>{% endif %}
    </div>
  </article>
  {% endfor %}
{% else %}
<p style="color:var(--c-muted);font-family:'Martian Mono',monospace;font-size:12px;">No cases published yet.</p>
{% endif %}
