import { Context, Contract, Info, Returns, Transaction } from 'fabric-contract-api';
import { UserAsset } from './asset';

@Info({ title: 'UserContract', description: 'Smart contract for managing users' })
export class UserContract extends Contract {

  @Transaction()
  public async CreateUser(ctx: Context, userId: string, email: string, username: string, password: string, roleId: string): Promise<void> {
    const exists = await this.UserExists(ctx, userId);
    if (exists) {
      throw new Error(`The user ${userId} already exists`);
    }

    const user: UserAsset = {
      userId,
      email,
      username,
      password,
      roleId,
      resetToken: '' // default empty
    };

    await ctx.stub.putState(userId, Buffer.from(JSON.stringify(user)));
  }

  @Transaction(false)
  @Returns('UserAsset')
  public async ReadUser(ctx: Context, userId: string): Promise<UserAsset> {
    const userJSON = await ctx.stub.getState(userId);
    if (!userJSON || userJSON.length === 0) {
      throw new Error(`The user ${userId} does not exist`);
    }
    return JSON.parse(userJSON.toString()) as UserAsset;
  }

  @Transaction()
  public async UpdateUser(ctx: Context, userId: string, email: string, username: string, password: string, roleId: string, resetToken: string): Promise<void> {
    const exists = await this.UserExists(ctx, userId);
    if (!exists) {
      throw new Error(`The user ${userId} does not exist`);
    }

    const updated: UserAsset = {
      userId,
      email,
      username,
      password,
      roleId,
      resetToken
    };

    await ctx.stub.putState(userId, Buffer.from(JSON.stringify(updated)));
  }

  @Transaction()
  public async DeleteUser(ctx: Context, userId: string): Promise<void> {
    const exists = await this.UserExists(ctx, userId);
    if (!exists) {
      throw new Error(`The user ${userId} does not exist`);
    }

    await ctx.stub.deleteState(userId);
  }

  @Transaction(false)
  @Returns('UserAsset[]')
  public async GetAllUsers(ctx: Context): Promise<UserAsset[]> {
    const results: UserAsset[] = [];
    const iterator = await ctx.stub.getStateByRange('', '');

    let result = await iterator.next();
    while (!result.done) {
      const strValue = result.value.value.toString('utf8');
      try {
        const record = JSON.parse(strValue);
        if (record.userId) results.push(record as UserAsset);
      } catch (e) {
        console.error('Error parsing user:', e);
      }
      result = await iterator.next();
    }

    return results;
  }

  @Transaction(false)
  @Returns('boolean')
  public async UserExists(ctx: Context, userId: string): Promise<boolean> {
    const buffer = await ctx.stub.getState(userId);
    return !!(buffer && buffer.length > 0);
  }
}
