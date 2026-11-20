import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createToken, ServiceContainer } from '../../di/container';

describe('ServiceContainer (DI)', () => {
  it('resolves singletons once and reuses the same instance', () => {
    const container = new ServiceContainer();
    const token = createToken<{ id: number }>('Counter');
    let count = 0;

    container.registerSingleton(token, () => {
      count += 1;
      return { id: count };
    });

    const first = container.resolve(token);
    const second = container.resolve(token);

    assert.equal(first, second);
    assert.equal(first.id, 1);
    assert.equal(count, 1);
  });

  it('creates a fresh instance per resolve for transient registrations', () => {
    const container = new ServiceContainer();
    const token = createToken<{ id: number }>('Transient');
    let count = 0;

    container.registerTransient(token, () => {
      count += 1;
      return { id: count };
    });

    const first = container.resolve(token);
    const second = container.resolve(token);

    assert.notEqual(first, second);
    assert.equal(first.id, 1);
    assert.equal(second.id, 2);
  });

  it('supports child containers that override parent registrations without mutating parent', () => {
    const parent = new ServiceContainer();
    const greetingToken = createToken<string>('Greeting');
    const consumerToken = createToken<string>('Consumer');

    parent.registerInstance(greetingToken, 'parent-hello');
    parent.registerTransient(consumerToken, (c) => `msg:${c.resolve(greetingToken)}`);

    const child = parent.createChildContainer();
    child.registerInstance(greetingToken, 'child-override');
    child.registerTransient(consumerToken, (c) => `msg:${c.resolve(greetingToken)}`);

    assert.equal(parent.resolve(consumerToken), 'msg:parent-hello');
    assert.equal(child.resolve(consumerToken), 'msg:child-override');
  });

  it('detects circular dependencies and throws a descriptive error', () => {
    const container = new ServiceContainer();
    const tokenA = createToken<unknown>('ServiceA');
    const tokenB = createToken<unknown>('ServiceB');

    container.registerSingleton(tokenA, (c) => c.resolve(tokenB));
    container.registerSingleton(tokenB, (c) => c.resolve(tokenA));

    assert.throws(
      () => container.resolve(tokenA),
      /Circular dependency detected.*ServiceA -> ServiceB -> ServiceA/
    );
  });

  it('throws when resolving an unregistered token and disposes owned singletons', () => {
    const container = new ServiceContainer();
    const missingToken = createToken<string>('Missing');
    assert.throws(() => container.resolve(missingToken), /No service registered/);

    let disposed = false;
    const disposableToken = createToken<{ dispose: () => void }>('Disposable');
    container.registerSingleton(disposableToken, () => ({
      dispose: () => {
        disposed = true;
      },
    }));

    container.resolve(disposableToken);
    container.dispose();
    assert.equal(disposed, true);
    assert.throws(() => container.resolve(disposableToken), /disposed/);
  });
});
