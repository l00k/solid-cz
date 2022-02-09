import { ExtERC20 } from '@/ExtERC20';
import { Staking } from '@/Staking';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber } from 'ethers';
import { ethers, network } from 'hardhat';
import { Factory } from '../fixtures/contracts';
import { createTokens } from '../fixtures/tokens';
import { mineBlock, tokenFormat, waitForTxs } from '../helpers/utils';



type Pool = {
    tokenIdx : number,
    amount : BigNumber,
    timespan : number,
    rewardsPerSecond : BigNumber,
};

type Staker = {
    account : SignerWithAddress,
    stake : BigNumber,
    rewards : BigNumber[],
};

type Stakers = {
    alice : Staker,
    bob : Staker,
    carol : Staker,
    dave : Staker,
};



xdescribe('Staking / Users limit', async() => {
    let owner : SignerWithAddress;
    
    let tokenMain : ExtERC20;
    let tokenRewards : { [i : number] : ExtERC20 } = {};
    
    let stakingContract : Staking;
    let rewardPools : { [i : number] : any } = {};
    
    let pools : Partial<Pool>[] = [];
    
    
    /**
     * BEFORE ALL
     */
    beforeEach(async() => {
        [ owner ] = await ethers.getSigners();
        
        [
            tokenMain,
            tokenRewards[0],
            tokenRewards[1],
            tokenRewards[2]
        ] = await createTokens('staking', 'reward1', 'reward2', 'reward3');
        
        stakingContract = await Factory.Staking(tokenMain.address);
        
        // pools
        pools = [
            {
                tokenIdx: 0,
                amount: tokenFormat(1000000),
                timespan: 10000,
            },
            {
                tokenIdx: 1,
                amount: tokenFormat(5000000),
                timespan: 20000,
            },
            {
                tokenIdx: 2,
                amount: tokenFormat(50000, 8),
                timespan: 1000,
            },
        ];
        
        for (const pool of pools) {
            const token = tokenRewards[pool.tokenIdx];
            
            // approve reward token
            const approveTx = await token.connect(owner).approve(
                stakingContract.address,
                pool.amount
            );
            await approveTx.wait();
            
            // create pool
            const poolCreateTx = await stakingContract.connect(owner).createRewardsPool(
                token.address,
                pool.amount,
                pool.timespan
            );
            await poolCreateTx.wait();
        }
    });
    
    afterEach(async() => {
        await network.provider.send('evm_setAutomine', [ true ]);
    });
    
    
    it('Handles 100 users', async function() {
        await network.provider.send('evm_setAutomine', [ false ]);
        
        this.timeout(60 * 1000);
        
        for (let i = 0; i < 100; ++i) {
            const address = '0x' + Number(i + 10).toString(16).padStart(40, '0');
            
            await network.provider.request({
                method: 'hardhat_impersonateAccount',
                params: [ address ],
            });
            const account = await ethers.getSigner(address);
            
            await owner.sendTransaction({
                value: ethers.utils.parseEther('5'),
                to: address,
            });
            await mineBlock();
            
            
            const txs = [];
            
            // send tokens
            txs.push(
                await tokenMain
                    .connect(owner)
                    .transfer(account.address, tokenFormat(100))
            );
            
            // approve
            txs.push(
                await tokenMain
                    .connect(account)
                    .approve(
                        stakingContract.address,
                        tokenFormat(1000)
                    )
            );
            
            // stake
            txs.push(
                await stakingContract
                    .connect(account)
                    .stake(tokenFormat(100))
            );
            
            await mineBlock();
            
            const results = await waitForTxs(txs);
            const stakeResult = results.pop();
            
            console.log(
                i,
                stakeResult.gasUsed.toNumber()
            );
        }
    });
    
});
