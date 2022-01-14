import { Feeding, NewZombieEvent } from '@/Feeding';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import { assertErrorMessage, findEvent, timetravel } from './helpers/utils';



const contractsToTest = [
    'Feeding',
    'CryptoZombies',
];

contractsToTest.forEach(contractToTest => {
    
    describe(`${contractToTest} is ZombieFeeding`, async() => {
        let owner : SignerWithAddress;
        let alice : SignerWithAddress;
        let bob : SignerWithAddress;
        let contract : Feeding;
        
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
        
        it('Allow only owner to change kitty contract address', async() => {
            {
                const tx = contract
                    .connect(bob)
                    .setKittyContractAddress('0x0000000000000000000000000000000000000000');
                await expect(tx).revertedWith('Ownable: caller is not the owner');
            }
            
            {
                const tx = await contract
                    .connect(owner)
                    .setKittyContractAddress('0x0000000000000000000000000000000000000000');
                const result = await tx.wait();
                expect(result.status).to.equal(1);
            }
        });
        
        it('Allow to feed only when ready', async() => {
            {
                const tx = contract
                    .connect(alice)
                    .feedOnKitty(zombies.alice, 1);
            
                await assertErrorMessage(
                    tx,
                    `ZombieIsNotReady(${zombies.alice})`
                );
            }
            
            await timetravel(24 * 3600);
            
            {
                const tx = await contract
                    .connect(alice)
                    .feedOnKitty(zombies.alice, 1);
                const result = await tx.wait();
            
                expect(result.status).to.equal(1);
                
                const newZombieEvent = findEvent<NewZombieEvent>(result, 'NewZombie');
                expect(newZombieEvent).to.containSubset({
                    event: 'NewZombie',
                    args: { 1: 'NoName' }
                });
            }
            
            {
                const tx = contract
                    .connect(alice)
                    .feedOnKitty(zombies.alice, 1);
            
                await assertErrorMessage(
                    tx,
                    `ZombieIsNotReady(${zombies.alice})`
                );
            }
        });
        
        it('Allow to feed only owned zombie', async() => {
            await timetravel(24 * 3600);
            
            const tx = contract
                .connect(bob)
                .feedOnKitty(zombies.alice, 1);
            
            await assertErrorMessage(
                tx,
                `NotOwnerOfZombie(${zombies.alice})`
            );
        });
        
        it('Check proper DNA', async() => {
            await timetravel(24 * 3600);
        
            const tx = await contract
                .connect(alice)
                .feedOnKitty(zombies.alice, 1);
            const result = await tx.wait();
        
            expect(result.status).to.equal(1);
            
            const newZombieEvent = findEvent<NewZombieEvent>(result, 'NewZombie');
            const zombie = await contract.zombies(newZombieEvent.args.zombieId);
            
            expect(zombie.dna.toNumber() % 100).to.equal(99);
        });
        
    });
    
});
