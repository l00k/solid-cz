import { Coin } from '@/Coin';
import { Staking, TokenStakedEvent } from '@/Staking';
import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import { Factory } from '../fixtures/contracts';
import { createTokens } from '../fixtures/tokens';
import { assertErrorMessage, findEvent, tokenFormat } from '../helpers/utils';


const day = 24 * 3600;
const month = 30 * day;


describe('Staking / Staking', async() => {
    let creator, alice, bob, john, jane;
    let tokenMain : Coin;
    let tokenRewards : { [i : number] : Coin } = {
        0: null,
        1: null,
        2: null,
    };
    let stakingContract : Staking;
    let rewardPools : { [i : number] : any } = {};
    
    beforeEach(async() => {
        [ creator, alice, bob, john, jane ] = await ethers.getSigners();
        
        [
            tokenMain,
            tokenRewards[0],
            tokenRewards[1],
            tokenRewards[2]
        ] = await createTokens('staking', 'reward1', 'reward2', 'reward3');
        
        stakingContract = await Factory.Staking(tokenMain.address);
    });
    
    
    it('Properly validate arguments', async() => {
        {
            const tx = stakingContract.connect(creator).stake(0);
            assertErrorMessage(tx, 'WrongAmount()');
        }
    });
    
    it('Require sufficient amount of allowed tokens', async() => {
        {
            const tx = await tokenMain.connect(alice).approve(
                stakingContract.address,
                tokenFormat(1000)
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        
        {
            const tx = stakingContract.connect(alice).stake(tokenFormat(1001));
            assertErrorMessage(tx, `InsufficientBalance(${tokenFormat(1001)}, ${tokenFormat(1000)})`);
        }
        
        {
            const balanceBefore = await tokenMain.balanceOf(alice.address);
            
            const tx = await stakingContract.connect(alice).stake(tokenFormat(1000));
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
            
            const event = findEvent<TokenStakedEvent>(result, 'TokenStaked');
            expect(event.args.amount).to.be.equal(tokenFormat(1000));
            
            const balanceAfter = await tokenMain.balanceOf(alice.address);
            const delta = balanceBefore.sub(balanceAfter);
            expect(delta).to.be.equal(tokenFormat(1000));
        }
    });
    
    
    it('Returns proper state informations', async() => {
        // check state before any action
        {
            const stake = await stakingContract.balanceOf(alice.address);
            expect(stake).to.be.equal(0);
        }
        
        // approve
        {
            const tx = await tokenMain.connect(alice).approve(
                stakingContract.address,
                tokenFormat(10000)
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        
        {
            const tx = await stakingContract.connect(alice).stake(tokenFormat(1000));
            const result = await tx.wait();
            
            expect(result.status).to.be.equal(1);
            
            const stake = await stakingContract.balanceOf(alice.address);
            expect(stake).to.be.equal(tokenFormat(1000));
        }
        
        {
            const tx = await stakingContract.connect(alice).stake(tokenFormat(2000));
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
            
            const stake = await stakingContract.balanceOf(alice.address);
            expect(stake).to.be.equal(tokenFormat(3000));
        }
    });
    
    it('Should not allow to stake amount less than minimal', async() => {
        {
            const tx = await stakingContract.connect(creator).changeStakeLimits(
                tokenFormat(10000),
                tokenFormat(10),
                tokenFormat(1000)
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        
        // approve
        {
            const tx = await tokenMain.connect(alice).approve(
                stakingContract.address,
                tokenFormat(10000)
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        
        {
            const tx = stakingContract.connect(alice).stake(tokenFormat(5));
            await assertErrorMessage(tx, `StakeBelowMinimal(${tokenFormat(10)})`);
        }
        
        {
            const tx = await stakingContract.connect(alice).stake(tokenFormat(10));
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
    });
    
    it('Should not allow to stake amount more than maximal', async() => {
        {
            const tx = await stakingContract.connect(creator).changeStakeLimits(
                tokenFormat(10000),
                tokenFormat(10),
                tokenFormat(1000)
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        
        // approve
        {
            const tx = await tokenMain.connect(alice).approve(
                stakingContract.address,
                tokenFormat(10000)
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        
        {
            const tx = stakingContract.connect(alice).stake(tokenFormat(1005));
            await assertErrorMessage(tx, `StakeAboveMaximal(${tokenFormat(1000)})`);
        }
        
        {
            const tx = await stakingContract.connect(alice).stake(tokenFormat(1000));
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
    });
    
    it('Should not allow to stake when limit exceed', async() => {
        {
            const tx = await stakingContract.connect(creator).changeStakeLimits(
                tokenFormat(10000),
                tokenFormat(10),
                tokenFormat(20000)
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        
        // approve and stake by Alice
        {
            const tx = await tokenMain.connect(alice).approve(
                stakingContract.address,
                tokenFormat(10000)
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        {
            const tx = await stakingContract.connect(alice).stake(tokenFormat(9000));
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        
        // approve and stake by Bob
        {
            const tx = await tokenMain.connect(bob).approve(
                stakingContract.address,
                tokenFormat(10000)
            );
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
        }
        {
            const tx = stakingContract.connect(bob).stake(tokenFormat(1005));
            await assertErrorMessage(tx, `TotalStakeExceedLimit(${tokenFormat(10000)})`);
        }
    });
    
});
