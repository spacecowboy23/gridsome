import caniuse from '../utils/caniuse'
import { addClass, removeClass } from '../utils/class'
import { createObserver } from '../utils/intersectionObserver'


const observer = caniuse.IntersectionObserver
  ? createObserver(intersectionHandler)
  : null

export default {
  inserted(el) {
    observe(el)
  },
  update(el) {
    observe(el)
  },
  unbind(el) {
    unobserve(el)
  }
}

function intersectionHandler({ intersectionRatio, target }) {

  if (intersectionRatio > 0) {
    loadImage(target)
    observer.unobserve(target)
  }
}

function observe(el) {

  if (el.tagName !== 'PICTURE') {
    observeHtml(el)
  } else {
    if (!observer) loadImage(el)
    else observer.observe(el)
  }
}

function unobserve(el) {

  if (el.tagName !== 'PICTURE') {
    unobserveHtml(el)
  } else if (observer) {
    observer.unobserve(el)
  }
}

function observeHtml(context = document) {

  const images = context.querySelectorAll('picture')
  if (!images.length) return

  if (observer) {
    images.forEach(el => !el.__vue__ && observer.observe(el))
  } else {
    Array.from(images).forEach(el => !el.__vue__ && loadImage(el))
  }
}

function unobserveHtml(context = document) {

  if (observer) {
    context.querySelectorAll('picture').forEach(el => {
      if (!el.__vue__) observer.unobserve(el)
    })
  }
}

function loadImage(el) {

  const elements = el.querySelectorAll('[data-src], [data-srcset]')

  removeClass(el, 'g-image--before-load')
  addClass(el, 'g-image--loading')

  Array.from(elements).map((ele) => {

    const { dataset: { src, sizes, srcset } } = ele

    ele.onload = () => {
      removeClass(el, 'g-image--loading')
      addClass(el, 'g-image--loaded')
    }

    if (src) ele.src = src
    if (srcset) ele.srcset = srcset
    if (sizes) ele.sizes = sizes
  })
}