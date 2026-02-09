const should = require('should/as-function')
const exifStream = require('../../../src/components/exiftool/stream')
const { stripMetadata } = require('../../../src/components/index/index')

// a full exiftool-like entry with many groups, simulating real output
function fullExiftoolEntry () {
  return {
    SourceFile: 'holidays/IMG_0001.jpg',
    File: {
      FileModifyDate: '2016:08:24 14:51:36',
      MIMEType: 'image/jpeg',
      FileSize: '449 kB',
      FileType: 'JPEG',
      FilePermissions: 'rw-r--r--'
    },
    EXIF: {
      DateTimeOriginal: '2016:10:28 17:34:58',
      ImageDescription: 'Beautiful sunset',
      Make: 'Canon',
      Model: 'EOS 5D',
      FNumber: 2.8,
      ExposureTime: '1/125',
      ISO: 400,
      FocalLength: '50 mm',
      Lens: 'EF 50mm f/1.4',
      GPSLatitude: '+51.5285578',
      GPSLongitude: '-0.2420248',
      ThumbnailImage: 'base64-blob-very-large-data',
      ThumbnailOffset: 1234,
      ThumbnailLength: 5678
    },
    IPTC: {
      'Caption-Abstract': 'A nice photo',
      Headline: 'Sunset',
      Keywords: ['beach', 'sunset'],
      City: 'London',
      Country: 'UK'
    },
    XMP: {
      Description: 'XMP description',
      Title: 'XMP title',
      Label: 'Blue',
      Subject: ['travel', 'nature'],
      PersonInImage: ['John'],
      Rating: 4,
      Creator: 'Photographer',
      Rights: 'Copyright 2016'
    },
    QuickTime: {
      ContentCreateDate: '2016:10:28 17:34:58',
      CreationDate: '2016:10:28 17:34:58',
      CreateDate: '2016:10:28 17:34:58',
      Title: 'My video',
      Duration: '5.00 s',
      AudioChannels: 2
    },
    H264: {
      DateTimeOriginal: '2016:10:28 17:34:58'
    },
    GIF: {
      FrameCount: 10
    },
    Composite: {
      ImageSize: '800x600',
      Megapixels: 0.48
    },
    ICC_Profile: {
      ProfileDescription: 'sRGB',
      ColorSpaceData: 'RGB'
    },
    PrintIM: {
      PrintIMVersion: '0300'
    },
    MakerNotes: {
      InternalSerialNumber: 'ABC123'
    }
  }
}

describe('stripMetadata', function () {
  it('always preserves SourceFile', function () {
    const entry = fullExiftoolEntry()
    const stripped = stripMetadata(entry)
    should(stripped.SourceFile).eql('holidays/IMG_0001.jpg')
  })

  it('preserves core File fields and drops extras', function () {
    const entry = fullExiftoolEntry()
    const stripped = stripMetadata(entry)
    should(stripped.File).eql({
      FileModifyDate: '2016:08:24 14:51:36',
      MIMEType: 'image/jpeg'
    })
  })

  it('preserves needed EXIF fields by default (useMetadata=true, embedExif=false)', function () {
    const entry = fullExiftoolEntry()
    const stripped = stripMetadata(entry)
    should(stripped.EXIF).eql({
      DateTimeOriginal: '2016:10:28 17:34:58',
      ImageDescription: 'Beautiful sunset'
    })
  })

  it('preserves needed IPTC fields and drops extras', function () {
    const entry = fullExiftoolEntry()
    const stripped = stripMetadata(entry)
    should(stripped.IPTC).eql({
      'Caption-Abstract': 'A nice photo',
      Headline: 'Sunset',
      Keywords: ['beach', 'sunset']
    })
  })

  it('preserves needed XMP fields and drops extras', function () {
    const entry = fullExiftoolEntry()
    const stripped = stripMetadata(entry)
    should(stripped.XMP).eql({
      Description: 'XMP description',
      Title: 'XMP title',
      Label: 'Blue',
      Subject: ['travel', 'nature'],
      PersonInImage: ['John'],
      Rating: 4
    })
  })

  it('preserves needed QuickTime fields and drops extras', function () {
    const entry = fullExiftoolEntry()
    const stripped = stripMetadata(entry)
    should(stripped.QuickTime).eql({
      ContentCreateDate: '2016:10:28 17:34:58',
      CreationDate: '2016:10:28 17:34:58',
      CreateDate: '2016:10:28 17:34:58',
      Title: 'My video'
    })
  })

  it('preserves H264, GIF and Composite fields', function () {
    const entry = fullExiftoolEntry()
    const stripped = stripMetadata(entry)
    should(stripped.H264).eql({ DateTimeOriginal: '2016:10:28 17:34:58' })
    should(stripped.GIF).eql({ FrameCount: 10 })
    should(stripped.Composite).eql({ ImageSize: '800x600' })
  })

  it('drops ICC_Profile, PrintIM, MakerNotes', function () {
    const entry = fullExiftoolEntry()
    const stripped = stripMetadata(entry)
    should(stripped.ICC_Profile).be.undefined()
    should(stripped.PrintIM).be.undefined()
    should(stripped.MakerNotes).be.undefined()
  })

  it('keeps full EXIF group when embedExif=true, minus thumbnail blobs', function () {
    const entry = fullExiftoolEntry()
    const stripped = stripMetadata(entry, { embedExif: true })
    // should have all EXIF fields except thumbnail blobs
    should(stripped.EXIF.DateTimeOriginal).eql('2016:10:28 17:34:58')
    should(stripped.EXIF.Make).eql('Canon')
    should(stripped.EXIF.Model).eql('EOS 5D')
    should(stripped.EXIF.FNumber).eql(2.8)
    should(stripped.EXIF.GPSLatitude).eql('+51.5285578')
    // thumbnail blobs should be stripped
    should(stripped.EXIF.ThumbnailImage).be.undefined()
    should(stripped.EXIF.ThumbnailOffset).be.undefined()
    should(stripped.EXIF.ThumbnailLength).be.undefined()
  })

  it('drops IPTC, XMP and QuickTime.Title when useMetadata=false', function () {
    const entry = fullExiftoolEntry()
    const stripped = stripMetadata(entry, { useMetadata: false })
    // IPTC and XMP should be absent
    should(stripped.IPTC).be.undefined()
    should(stripped.XMP).be.undefined()
    // QuickTime should only have date fields, no Title
    should(stripped.QuickTime).eql({
      ContentCreateDate: '2016:10:28 17:34:58',
      CreationDate: '2016:10:28 17:34:58',
      CreateDate: '2016:10:28 17:34:58'
    })
    // EXIF should only have DateTimeOriginal (no ImageDescription)
    should(stripped.EXIF).eql({
      DateTimeOriginal: '2016:10:28 17:34:58'
    })
  })

  it('still keeps core fields when useMetadata=false', function () {
    const entry = fullExiftoolEntry()
    const stripped = stripMetadata(entry, { useMetadata: false })
    should(stripped.SourceFile).eql('holidays/IMG_0001.jpg')
    should(stripped.File).eql({
      FileModifyDate: '2016:08:24 14:51:36',
      MIMEType: 'image/jpeg'
    })
    should(stripped.H264).eql({ DateTimeOriginal: '2016:10:28 17:34:58' })
    should(stripped.GIF).eql({ FrameCount: 10 })
    should(stripped.Composite).eql({ ImageSize: '800x600' })
  })

  it('handles missing groups gracefully', function () {
    const entry = {
      SourceFile: 'test.jpg',
      File: {
        FileModifyDate: '2016:08:24 14:51:36',
        MIMEType: 'image/jpeg'
      }
    }
    const stripped = stripMetadata(entry)
    should(stripped.SourceFile).eql('test.jpg')
    should(stripped.File).eql({
      FileModifyDate: '2016:08:24 14:51:36',
      MIMEType: 'image/jpeg'
    })
    should(stripped.EXIF).be.undefined()
    should(stripped.IPTC).be.undefined()
    should(stripped.XMP).be.undefined()
  })
})

describe('buildTagArgs', function () {
  it('includes core tags by default', function () {
    const args = exifStream.buildTagArgs()
    should(args).containEql('-File:FileModifyDate')
    should(args).containEql('-File:MIMEType')
    should(args).containEql('-EXIF:DateTimeOriginal')
    should(args).containEql('-H264:DateTimeOriginal')
    should(args).containEql('-QuickTime:ContentCreateDate')
    should(args).containEql('-QuickTime:CreationDate')
    should(args).containEql('-QuickTime:CreateDate')
    should(args).containEql('-GIF:FrameCount')
    should(args).containEql('-Composite:ImageSize')
  })

  it('includes metadata tags by default (useMetadata defaults to true)', function () {
    const args = exifStream.buildTagArgs()
    should(args).containEql('-EXIF:ImageDescription')
    should(args).containEql('-IPTC:Caption-Abstract')
    should(args).containEql('-IPTC:Headline')
    should(args).containEql('-IPTC:Keywords')
    should(args).containEql('-XMP:Description')
    should(args).containEql('-XMP:Title')
    should(args).containEql('-XMP:Label')
    should(args).containEql('-XMP:Subject')
    should(args).containEql('-XMP:PersonInImage')
    should(args).containEql('-XMP:Rating')
    should(args).containEql('-QuickTime:Title')
  })

  it('excludes metadata tags when useMetadata is false', function () {
    const args = exifStream.buildTagArgs({ useMetadata: false })
    should(args).containEql('-File:FileModifyDate')
    should(args).containEql('-EXIF:DateTimeOriginal')
    should(args).containEql('-Composite:ImageSize')
    should(args).not.containEql('-EXIF:ImageDescription')
    should(args).not.containEql('-IPTC:Caption-Abstract')
    should(args).not.containEql('-IPTC:Keywords')
    should(args).not.containEql('-XMP:Description')
    should(args).not.containEql('-XMP:PersonInImage')
    should(args).not.containEql('-XMP:Rating')
    should(args).not.containEql('-QuickTime:Title')
  })

  it('does not include full EXIF group by default', function () {
    const args = exifStream.buildTagArgs()
    should(args).not.containEql('-EXIF:all')
  })

  it('includes full EXIF group when embedExif is true', function () {
    const args = exifStream.buildTagArgs({ embedExif: true })
    should(args).containEql('-EXIF:all')
  })

  it('includes full EXIF but no metadata tags when useMetadata=false, embedExif=true', function () {
    const args = exifStream.buildTagArgs({ useMetadata: false, embedExif: true })
    should(args).containEql('-EXIF:all')
    should(args).not.containEql('-IPTC:Keywords')
    should(args).not.containEql('-XMP:PersonInImage')
  })
})
