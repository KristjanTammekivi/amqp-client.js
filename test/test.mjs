import test from 'ava';
import AMQPClient from '../src/amqp-socket-client.mjs';

test('can open a connection and a channel', t => {
  const amqp = new AMQPClient("amqp://")
  return amqp.connect()
    .then((conn) => conn.channel())
    .then((ch) => t.is(ch.connection.channels.length, 2)) // 2 because channel 0 is counted
})

test('can publish and consume', t => {
  const amqp = new AMQPClient("amqp://localhost")
  return new Promise((resolve, reject) => {
    amqp.connect()
      .then((conn) => conn.channel())
      .then((ch) => ch.queue(""))
      .then((q) => q.publish("hello world"))
      .then((q) => q.bind("amq.fanout"))
      .then((q) => q.subscribe({noAck: false}, (msg) => {
        msg.ack()
        resolve(msg)
      }))
      .catch(reject)
  }).then((result) => t.is(result.bodyString(), "hello world"))
})

test('will throw an error', t => {
  const amqp = new AMQPClient("amqp://localhost")
  return amqp.connect()
    .then((conn) => conn.channel())
    .then((ch) => ch.queue("amq.foobar"))
    .catch((e) => t.regex(e.message, /ACCESS_REFUSED/))
})

test('can cancel a consumer', t => {
  const amqp = new AMQPClient("amqp://localhost")
  return amqp.connect()
    .then((conn) => conn.channel())
    .then((ch) => ch.queue(""))
    .then((q) => q.subscribe({noAck: false}, console.log))
    .then((consumer) => consumer.cancel())
    .then((channel) => t.deepEqual(channel.consumers, {}))
})

test('can close a channel', async t => {
  const amqp = new AMQPClient("amqp://localhost")
  const conn = await amqp.connect()
  const ch = await conn.channel()
  await ch.close()
  const error = await t.throwsAsync(async () => ch.close())
  t.is(error.message, 'Channel is closed');
})

test('connection error raises everywhere', async t => {
  const amqp = new AMQPClient("amqp://localhost")
  const conn = await amqp.connect()
  const ch = await conn.channel()
  await conn.close()
  try {
    await ch.close()
  } catch (err) {
    t.is(err.message, 'Channel is closed');
  }
})

test('consumer stops wait on cancel', async t => {
  const amqp = new AMQPClient("amqp://localhost")
  const conn = await amqp.connect()
  const ch = await conn.channel()
  const q = await ch.queue()
  const consumer = await q.subscribe({}, () => { })
  await q.publish("foobar")
  await conn.close()
  const ok = await consumer.wait()
  t.is(ok, undefined)
})

test('connection error raises on publish', async t => {
  const amqp = new AMQPClient("amqp://localhost")
  const conn = await amqp.connect()
  const ch = await conn.channel()
  const q = await ch.queue()
  await conn.close()
  t.throwsAsync(async () => q.publish("foobar"))
})

test('connection error aborts consumers', async t => {
  try {
    const amqp = new AMQPClient("amqp://localhost")
    const conn = await amqp.connect()
    const ch = await conn.channel()
    const q = await ch.queue()
    const consumer = await q.subscribe({}, () => { })
    await q.publish("foobar")
    await conn.close()
    await consumer.wait()
  } catch (err) {
    t.is(err.message, "")
  }
})
