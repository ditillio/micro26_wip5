---
title: Note di Microeconomia
layout: toc_split
---

{% assign path = page.path | split: '/' %}
{% assign depth = 0 %}
{% assign language = path[depth] %}
{% assign textbook = site.data.toc %}

<article>
  <h1>{{ textbook.title[language] }}</h1>
  <p>{{ textbook.author }}</p>
  <hr/>

  <div style="padding: 20px">
    <div class="chapter">
      <div class="number"></div>
      <a href="./pr.html">{% if language == 'it' %}Prefazione{% else %}Preface{% endif %}</a>
    </div>
  </div>

  {% for part in textbook.parts %}
  <div style="padding: 20px">
    <div class="subtitle" style="padding-top:30px; padding-bottom:20px">
      {% if part.folder %}
        Part{% if language == "it" %}e{% endif %} {{ part.folder }}: {{ part.title[language] }}
      {% else %}
        {{ part.title[language] }}
      {% endif %}
    </div>

    <div style="padding: 5px; margin-left: 15px">
      {% for chapter in part.chapters %}
      <div class="chapter_link">
        <div class="number">{{ chapter.folder }}</div>
        <a href="./{{ part.folder }}/{{ chapter.folder }}">{{ chapter.title[language] }}</a>
      </div>
      {% endfor %}
    </div>
  </div>
  {% endfor %}
</article>
