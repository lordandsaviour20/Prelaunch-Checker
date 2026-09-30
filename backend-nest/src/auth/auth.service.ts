import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { DbUser } from '../db/db.types';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  signToken(user: { id: number; email: string }): string {
    return this.jwtService.sign({ userId: user.id, email: user.email });
  }

  verifyToken(token: string): { userId: number; email: string } {
    return this.jwtService.verify(token);
  }
}