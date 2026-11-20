export interface ServiceToken<T> {
  readonly id: symbol;
  readonly description: string;
  readonly _typeBrand?: T;
}

export function createToken<T>(description: string): ServiceToken<T> {
  return {
    id: Symbol(description),
    description,
  };
}

export type ServiceLifetime = 'singleton' | 'transient';

export type ServiceFactory<T> = (container: IServiceContainer) => T;

export interface IServiceContainer {
  registerSingleton<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): this;
  registerTransient<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): this;
  registerInstance<T>(token: ServiceToken<T>, instance: T): this;
  resolve<T>(token: ServiceToken<T>): T;
  tryResolve<T>(token: ServiceToken<T>): T | undefined;
  has<T>(token: ServiceToken<T>): boolean;
  createChildContainer(): IServiceContainer;
  dispose(): void;
}

interface Registration<T> {
  lifetime: ServiceLifetime;
  factory?: ServiceFactory<T>;
  instance?: T;
}

interface DisposableLike {
  dispose: () => unknown;
}

function isDisposable(value: unknown): value is DisposableLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'dispose' in value &&
    typeof (value as DisposableLike).dispose === 'function'
  );
}

/**
 * Lightweight, type-safe IoC container supporting singletons, transients,
 * child scopes (for testing overrides), and circular dependency detection.
 */
export class ServiceContainer implements IServiceContainer {
  private readonly registrations = new Map<symbol, Registration<unknown>>();
  private readonly ownedInstances = new Set<unknown>();
  private readonly resolutionStack: symbol[] = [];
  private disposed = false;

  public constructor(private readonly parent?: ServiceContainer) {}

  public registerSingleton<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): this {
    this.ensureNotDisposed();
    this.registrations.set(token.id, {
      lifetime: 'singleton',
      factory,
    });
    return this;
  }

  public registerTransient<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): this {
    this.ensureNotDisposed();
    this.registrations.set(token.id, {
      lifetime: 'transient',
      factory,
    });
    return this;
  }

  public registerInstance<T>(token: ServiceToken<T>, instance: T): this {
    this.ensureNotDisposed();
    this.registrations.set(token.id, {
      lifetime: 'singleton',
      instance,
    });
    return this;
  }

  public has<T>(token: ServiceToken<T>): boolean {
    if (this.registrations.has(token.id)) {
      return true;
    }
    return this.parent ? this.parent.has(token) : false;
  }

  public tryResolve<T>(token: ServiceToken<T>): T | undefined {
    this.ensureNotDisposed();
    if (!this.has(token)) {
      return undefined;
    }
    return this.resolve(token);
  }

  public resolve<T>(token: ServiceToken<T>): T {
    this.ensureNotDisposed();

    const localReg = this.registrations.get(token.id) as Registration<T> | undefined;
    if (!localReg) {
      if (this.parent) {
        return this.parent.resolve(token);
      }
      throw new Error(`No service registered for token: ${token.description}`);
    }

    if (localReg.lifetime === 'singleton' && localReg.instance !== undefined) {
      return localReg.instance;
    }

    if (this.resolutionStack.includes(token.id)) {
      const cycle = [...this.resolutionStack, token.id]
        .map((sym) => sym.description ?? sym.toString())
        .join(' -> ');
      throw new Error(`Circular dependency detected while resolving services: ${cycle}`);
    }

    if (!localReg.factory) {
      throw new Error(`Service registration for ${token.description} has neither instance nor factory.`);
    }

    this.resolutionStack.push(token.id);
    try {
      const created = localReg.factory(this);
      if (localReg.lifetime === 'singleton') {
        localReg.instance = created;
        this.ownedInstances.add(created);
      }
      return created;
    } finally {
      this.resolutionStack.pop();
    }
  }

  public createChildContainer(): IServiceContainer {
    this.ensureNotDisposed();
    return new ServiceContainer(this);
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    for (const instance of this.ownedInstances) {
      if (isDisposable(instance)) {
        try {
          instance.dispose();
        } catch {
          // Ignore disposal errors during shutdown to ensure all instances are cleaned up.
        }
      }
    }
    this.ownedInstances.clear();
    this.registrations.clear();
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error('Cannot use a ServiceContainer after it has been disposed.');
    }
  }
}
