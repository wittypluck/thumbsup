const should = require('should/as-function')
const sinon = require('sinon')
const streamMock = require('stream-mock')
const exifStream = require('../../../src/components/exiftool/stream')
const parallel = require('../../../src/components/exiftool/parallel')

describe('exiftool parallel', function () {
  beforeEach(() => {
    sinon.stub(exifStream, 'parse').callsFake(mockExifStream)
  })

  afterEach(() => {
    exifStream.parse.restore()
  })

  it('creates multiple streams even with concurrency=1 due to I/O multiplier', (done) => {
    // test data
    const files = numberedFiles(8)
    const concurrency = 1
    // with multiplier of 4, concurrency=1 creates 4 workers
    // 8 files split into 4 buckets = 2 files per bucket
    const stream = parallel.parse('input', files, concurrency)
    reduceStream(stream, emittedData => {
      sinon.assert.callCount(exifStream.parse, 4)
      // should have all 8 files in the merged output
      const emittedPaths = emittedData.map(e => e.SourceFile)
      should(emittedPaths).have.length(8)
      done()
    })
  })

  it('creates concurrent streams to split files evenly', (done) => {
    // test data
    const files = numberedFiles(10)
    const concurrency = 2
    // with multiplier of 4, concurrency=2 creates 8 workers target
    // 10 files, chunk size = ceil(10/8) = 2, so 5 buckets of 2 files each
    const stream = parallel.parse('input', files, concurrency)
    reduceStream(stream, emittedData => {
      // should have created 5 streams (10 files / 2 per bucket)
      sinon.assert.callCount(exifStream.parse, 5)
      // should have 10 files in the merged output
      const emittedPaths = emittedData.map(e => e.SourceFile)
      should(emittedPaths).have.length(10)
      done()
    })
  })
})

function numberedFiles (count) {
  return Array(count).join(' ').split(' ').map((a, i) => `IMG_000${i + 1}.jpg`)
}

function mockExifStream (root, filenames, opts) {
  const input = filenames.map(name => {
    return { SourceFile: `${root}/${name}`, Directory: root }
  })
  return new streamMock.ObjectReadableMock(input)
}

function reduceStream (stream, done) {
  const emittedData = []
  stream.on('data', entry => {
    emittedData.push(entry)
  }).on('end', () => {
    done(emittedData)
  })
}
