const path = require('path')
const fs = require('fs-extra')
const pMap = require('p-map')
const sharp = require('sharp')
const imagemin = require('imagemin')
const colorString = require('color-string')
const imageminWebp = require('imagemin-webp')
const imageminMozjpeg = require('imagemin-mozjpeg')
const imageminPngquant = require('imagemin-pngquant')
const sysinfo = require('../utils/sysinfo')
const { warmupSharp } = require('../utils/sharp')

const resiz = (sharpImage, config, options, width, height, backgroundColor) => {
  if (!(
    (config.width && config.width <= width) ||
    (config.height && config.height <= height)
  )) {
    return
  }

  const resizeOptions = {}

  if (config.height) resizeOptions.height = config.height
  if (config.width) resizeOptions.width = config.width
  if (options.fit) resizeOptions.fit = sharp.fit[options.fit]
  if (options.position) resizeOptions.position = sharp.position[options.position]
  if (options.background && colorString.get(options.background)) {
    resizeOptions.background = options.background
  } else if (backgroundColor) {
    resizeOptions.background = backgroundColor
  }

  sharpImage.resize(resizeOptions)

  return sharpImage
}

const createWebp = async (config, ext, destPath, filePath, options, width, height, backgroundColor) => {

  let buffer

  // create new filename with '.webp' extension
  const newFilePath = path.join(
    path.dirname(destPath),
    path.basename(destPath, path.extname(destPath)) + '.webp'
  )

  try {
    buffer = await fs.readFile(filePath)
  } catch (err) {
    return
  }

  const sharpImage = sharp(buffer)

  // Rotate based on EXIF Orientation tag
  sharpImage.rotate()

  resiz(sharpImage, config, options, width, height, backgroundColor)

  if (/\.jpe?g$/.test(ext)) {
    sharpImage.jpeg({
      progressive: config.jpegProgressive,
      quality: config.quality
    })
  }

  if (/\.png$/.test(ext)) {
    sharpImage.png({
      compressionLevel: config.pngCompressionLevel,
      adaptiveFiltering: false
    })
  }

  const plugins = [imageminWebp({
    quality: config.quality
  })]

  buffer = await sharpImage.toBuffer()

  buffer = await imagemin.buffer(buffer, { plugins })

  await fs.outputFile(newFilePath, buffer)

}

exports.processImage = async function ({
  width,
  height,
  filePath,
  destPath,
  cachePath,
  imagesConfig,
  options = {}
}) {


  const isImageUseWebp = process.env.IMAGE_USE_WEBP || ''

  const { ext } = path.parse(filePath)
  const { backgroundColor } = imagesConfig

  if (cachePath) {
    // change cachePath, destPath for .webp Image
    const cachePathWebp = path.join(path.dirname(cachePath), path.basename(cachePath, path.extname(cachePath)) + '.webp')
    const destPathWebp = path.join(path.dirname(destPath), path.basename(destPath, path.extname(destPath)) + '.webp')

    // when we have a .webp image present and flag for .webp is set, copy to destPath
    if (
      isImageUseWebp
      && ext !== '.webp'
      && await fs.exists(cachePathWebp)
      && await fs.exists(cachePath)
    ) {
      fs.copy(cachePathWebp, destPathWebp)
      fs.copy(cachePath, destPath)
      return
    }

    if (
      !isImageUseWebp
      && await fs.exists(cachePath)
    ) { return fs.copy(cachePath, destPath) }
  }

  let buffer = await fs.readFile(filePath)

  const config = {
    pngCompressionLevel: parseInt(options.pngCompressionLevel, 10) || 9,
    quality: parseInt(options.quality, 10) || 75,
    width: parseInt(options.width, 10) || null,
    height: parseInt(options.height, 10) || null,
    jpegProgressive: true
  }

  if (['.png', '.jpeg', '.jpg', '.webp'].includes(ext)) {

    const plugins = []
    const sharpImage = sharp(buffer)

    // Rotate based on EXIF Orientation tag
    sharpImage.rotate()

    resiz(sharpImage, config, options, width, height, backgroundColor)


    if (/\.png$/.test(ext)) {
      sharpImage.png({
        compressionLevel: config.pngCompressionLevel,
        adaptiveFiltering: false
      })
      const quality = config.quality / 100
      plugins.push(imageminPngquant({
        quality: [quality, quality]
      }))
    }


    if (/\.jpe?g$/.test(ext)) {
      sharpImage.jpeg({
        progressive: config.jpegProgressive,
        quality: config.quality
      })
      plugins.push(imageminMozjpeg({
        progressive: config.jpegProgressive,
        quality: config.quality
      }))
    }

    if (/\.webp$/.test(ext)) {
      sharpImage.webp({
        quality: config.quality
      })
      plugins.push(imageminWebp({
        quality: config.quality
      }))
    }

    buffer = await sharpImage.toBuffer()
    buffer = await imagemin.buffer(buffer, { plugins })
  }

  await fs.outputFile(destPath, buffer)

  // create .webp image when flag is set
  if (
    isImageUseWebp
    && ['.png', '.jpeg', '.jpg'].includes(ext)
    // && process.env.GRIDSOME_MODE !== 'serve'
  ) {
    await createWebp(config, ext, destPath, filePath, options, width, height, backgroundColor)
  }
}

exports.process = async function ({
  queue,
  context,
  cacheDir,
  imagesConfig
}) {

  await warmupSharp(sharp)
  await pMap(queue, async set => {
    const cachePath = cacheDir ? path.join(cacheDir, set.filename) : null

    try {
      await exports.processImage({
        destPath: set.destPath,
        imagesConfig,
        cachePath,
        ...set
      })
    } catch (err) {
      const relPath = path.relative(context, set.filePath)
      throw new Error(`Failed to process image ${relPath}. ${err.message}`)
    }

  }, {
    concurrency: sysinfo.cpus.logical
  })
}
