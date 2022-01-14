import { NewZombieEvent } from '@/Feeding';
import { Pay2Win } from '@/Pay2Win';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { assertErrorMessage, findEvent } from './helpers/utils';


const zombieNames = [
    'Zombie #1',
    'Zombie #2'
];

const contractsToTest = [
    'Pay2Win',
    'CryptoZombies',
];

contractsToTest.forEach(contractToTest => {
    
    describe(`${contractToTest} is Pay2Win`, async() => {
        let owner : SignerWithAddress;
        let alice : SignerWithAddress;
        let bob : SignerWithAddress;
        let contract : Pay2Win;
        
        const zombies : any = {
            alice: null,
            bob: null,
        };
        
        beforeEach(async() => {
            [ owner, alice, bob ] = await ethers.getSigners();
            
            const contractFactory = await ethers.getContractFactory(contractToTest, owner);
            contract = <any>await contractFactory.deploy();
            await contract.deployed();
            
            {
                const tx = await contract
                    .connect(alice)
                    .createRandomZombie('Alice zombie');
                const result = await tx.wait();
                zombies.alice = findEvent<NewZombieEvent>(result, 'NewZombie').args.zombieId;
            }
            
            {
                const tx = await contract
                    .connect(bob)
                    .createRandomZombie('Bob zombie');
                const result = await tx.wait();
                zombies.bob = findEvent<NewZombieEvent>(result, 'NewZombie').args.zombieId;
            }
        });
        
        it('Allow only owner to set level up fee', async() => {
            {
                const tx = contract
                    .connect(bob)
                    .setLevelUpFee(ethers.utils.parseEther('0.005'));
                await expect(tx).revertedWith('Ownable: caller is not the owner');
            }
            
            {
                const tx = await contract
                    .connect(owner)
                    .setLevelUpFee(ethers.utils.parseEther('0.005'));
                const result = await tx.wait();
                expect(result.status).to.equal(1);
            }
        });
        
        it('Pay proper fee to level up', async() => {
            {
                const tx = await contract
                    .connect(alice)
                    .levelUp(zombies.alice, { value: ethers.utils.parseEther('0.001') });
                const result = await tx.wait();
                expect(result.status).to.equal(1);
                
                const zombie = await contract.zombies(zombies.alice);
                expect(zombie.level).to.equal(2);
            }
            
            {
                const tx = contract
                    .connect(bob)
                    .levelUp(zombies.bob, { value: ethers.utils.parseEther('0.002') });
                await assertErrorMessage(
                    tx,
                    'WrongFeeAmount(' + ethers.utils.parseEther('0.001') + ', ' + ethers.utils.parseEther('0.002') + ')'
                );
                
                const zombie = await contract.zombies(zombies.bob);
                expect(zombie.level).to.equal(1);
            }
        });
        
        it('Allow only owner to withdraw', async() => {
            const initialBalance = await owner.getBalance();
            
            // pay some fee
            {
                const tx = await contract
                    .connect(alice)
                    .levelUp(zombies.alice, { value: ethers.utils.parseEther('0.001') });
                const result = await tx.wait();
                expect(result.status).to.equal(1);
            }
            
            {
                const tx = contract
                    .connect(bob)
                    .withdraw();
                await expect(tx).revertedWith('Ownable: caller is not the owner');
            }
            
            {
                const tx = await contract
                    .connect(owner)
                    .withdraw();
                const result = await tx.wait();
                expect(result.status).to.equal(1);
                
                const currentBalance = await owner.getBalance();
                const delta = currentBalance
                    .sub(initialBalance)
                    .add(result.effectiveGasPrice.mul(result.gasUsed));
                expect(delta).to.equal(ethers.utils.parseEther('0.001'));
            }
        });
        
        it('Allow to change name only above required level', async() => {
            // try without required level
            {
                const tx = contract
                    .connect(alice)
                    .changeName(zombies.alice, 'Test');
                await assertErrorMessage(
                    tx,
                    'ZombieLevelTooLow(2, 1)'
                );
            }
            
            // level up
            {
                const tx = await contract
                    .connect(alice)
                    .levelUp(zombies.alice, { value: ethers.utils.parseEther('0.001') });
                const result = await tx.wait();
                expect(result.status).to.equal(1);
            }
            
            {
                const tx = await contract
                    .connect(alice)
                    .changeName(zombies.alice, 'Test');
                const result = await tx.wait();
                
                expect(result.status).to.equal(1);
                
                const zombie = await contract.zombies(zombies.alice);
                expect(zombie.name).to.equal('Test');
            }
        });
        
        it('Allow to change DBA only above required level', async() => {
            // try without required level
            {
                const tx = contract
                    .connect(alice)
                    .changeDna(zombies.alice, 0x1234);
                await assertErrorMessage(
                    tx,
                    'ZombieLevelTooLow(20, 1)'
                );
            }
            
            // level up
            for (let i = 1; i < 20; ++i) {
                const tx = await contract
                    .connect(alice)
                    .levelUp(zombies.alice, { value: ethers.utils.parseEther('0.001') });
                const result = await tx.wait();
                expect(result.status).to.equal(1);
            }
            
            {
                const tx = await contract
                    .connect(alice)
                    .changeDna(zombies.alice, 0x1234);
                const result = await tx.wait();
                
                expect(result.status).to.equal(1);
                
                const zombie = await contract.zombies(zombies.alice);
                expect(zombie.dna).to.equal('0x1234');
            }
        });
    });
});
