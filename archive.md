---
layout: template
title: Archive
description: All posts — oxbyte blog
---

# Archive

{% assign posts_by_year = site.posts | group_by_exp: "post", "post.date | date: '%Y'" %}
{% for year_group in posts_by_year %}
<div class="archive-year">
  <h2>{{ year_group.name }}</h2>
  {% for post in year_group.items %}
    {% assign diff_badge = "" %}
    {% for tag in post.tags %}
      {% if tag contains "diff/" %}{% assign diff_badge = tag | remove: "diff/" %}{% endif %}
    {% endfor %}
    <div class="archive-item">
      <time>{{ post.date | date: "%m-%d" }}</time>
      <a href="{{ post.url }}">{{ post.title }}</a>
      {% if diff_badge != "" %}<span class="badge badge-{{ diff_badge }}">{{ diff_badge }}</span>{% endif %}
    </div>
  {% endfor %}
</div>
{% endfor %}
